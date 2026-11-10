import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Profile, Tweet } from "@the-convocation/twitter-scraper";
import z from "zod";
import type { DBType } from "~/db";
import { migrate } from "~/db/migration";
import * as schema from "~/db/schema/v2";
import v2 from "~/db/sql/migration_v2.sql" with { type: "text" };
import v1 from "~/db/sql/migration_v1.sql" with { type: "text" };
import { type TwitterHandle } from "~/env";
import { syncPinnedPosts } from "./sync-pinned-posts";
import {
  defineSynchronizerFactory,
  type TaggedSynchronizer,
} from "./synchronizer";

const handle: TwitterHandle = {
  env: "TWITTER_HANDLE",
  postFix: "",
  handle: "source",
  slot: 0,
};
const storeSchema = z.object({ id: z.string() });
const rawTweet = (id: string): Tweet => ({
  id,
  text: "Old pinned post",
  hashtags: [],
  mentions: [],
  photos: [],
  thread: [],
  urls: [],
  videos: [],
});

describe("pinned-post synchronization", () => {
  let sqlite: Database;
  let db: DBType;
  let pinnedTweetIds: string[] | undefined;
  let failPin: boolean;
  const getProfile = mock(async (): Promise<Profile> => ({ pinnedTweetIds }));
  const getTweet = mock(async (id: string): Promise<Tweet | null> =>
    rawTweet(id),
  );
  const syncPost = mock(async ({ tweet }: { tweet: { id: string } }) => ({
    store: { id: `mirror-${tweet.id}` },
  }));
  const setPostPinned = mock(
    async (_args: { store: { id: string }; pinned: boolean }) => {
      if (failPin) throw new Error("Pin unavailable");
    },
  );
  let synchronizer: TaggedSynchronizer<typeof storeSchema>;

  beforeEach(async () => {
    sqlite = new Database(":memory:");
    sqlite.exec(v1);
    sqlite.exec(v2);
    db = drizzle({ client: sqlite });
    pinnedTweetIds = ["old"];
    failPin = false;
    getProfile.mockClear();
    getTweet.mockReset();
    getTweet.mockImplementation(async (id) => rawTweet(id));
    syncPost.mockClear();
    setPostPinned.mockClear();
    synchronizer = {
      displayName: "Test",
      platformId: "test",
      emoji: "T",
      storeSchema,
      syncPost,
      setPostPinned,
    };
  });
  afterEach(() => sqlite.close());

  const run = (
    overrides: Partial<Parameters<typeof syncPinnedPosts>[0]> = {},
  ) =>
    syncPinnedPosts({
      db,
      handle,
      x: { getProfile, getTweet },
      synchronizers: [synchronizer],
      enabled: true,
      ...overrides,
    });

  test("is enabled by default", () => {
    const result = Bun.spawnSync(
      [
        process.execPath,
        "--no-env-file",
        "-e",
        'const { SYNC_PINNED_POSTS } = await import("./src/env.ts"); console.log(SYNC_PINNED_POSTS);',
      ],
      {
        env: { ...process.env, NODE_ENV: "test", SYNC_PINNED_POSTS: undefined },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim().split("\n").at(-1)).toBe("true");
  });

  test("mirrors an old pin independently of timeline scans and pins it", async () => {
    await run();
    expect(getTweet).toHaveBeenCalledWith("old");
    expect(syncPost).toHaveBeenCalledTimes(1);
    expect(syncPost.mock.calls[0]?.[0].tweet).toMatchObject({
      id: "old",
      isPin: true,
    });
    expect(setPostPinned.mock.calls[0]?.[0]).toMatchObject({
      store: { id: "mirror-old" },
      pinned: true,
    });
    expect(db.select().from(schema.PinnedPost).all()).toEqual([
      { userHandle: "source", platform: "test", tweetId: "old" },
    ]);
  });

  test("reuses previously mirrored posts even when globally marked synced", async () => {
    db.insert(schema.TweetMap)
      .values({
        tweetId: "old",
        platform: "test",
        platformStore: '{"id":"existing"}',
      })
      .run();
    db.insert(schema.TweetSynced).values({ tweetId: "old", synced: 1 }).run();
    await run();
    expect(getTweet).not.toHaveBeenCalled();
    expect(syncPost).not.toHaveBeenCalled();
    expect(setPostPinned.mock.calls[0]?.[0].store).toEqual({ id: "existing" });
  });

  test("changing the pin creates the replacement and removes the old managed pin", async () => {
    await run();
    setPostPinned.mockClear();
    pinnedTweetIds = ["new"];
    await run();
    expect(
      setPostPinned.mock.calls.map(([a]) => [a.store.id, a.pinned]),
    ).toEqual([
      ["mirror-old", false],
      ["mirror-new", true],
    ]);
    expect(db.select().from(schema.PinnedPost).get()?.tweetId).toBe("new");
  });

  test("replaces the managed pin when the destination is at its pin limit", async () => {
    const remotePins = new Set<string>();
    const limited: TaggedSynchronizer<typeof storeSchema> = {
      ...synchronizer,
      async setPostPinned({
        store,
        pinned,
      }: {
        store: { id: string };
        pinned: boolean;
      }) {
        if (!pinned) {
          remotePins.delete(store.id);
          return;
        }
        if (remotePins.size && !remotePins.has(store.id))
          throw new Error("Pin limit reached");
        remotePins.add(store.id);
      },
    };
    await run({ synchronizers: [limited] });
    pinnedTweetIds = ["new"];
    await run({ synchronizers: [limited] });
    expect([...remotePins]).toEqual(["mirror-new"]);
    expect(db.select().from(schema.PinnedPost).get()?.tweetId).toBe("new");
  });

  test("source pin removal unpins only the recorded managed post", async () => {
    await run();
    setPostPinned.mockClear();
    pinnedTweetIds = [];
    await run();
    expect(
      setPostPinned.mock.calls.map(([a]) => [a.store.id, a.pinned]),
    ).toEqual([["mirror-old", false]]);
    expect(db.select().from(schema.PinnedPost).all()).toEqual([]);
    expect(syncPost).toHaveBeenCalledTimes(1);
  });

  test("retries a failed pin without reposting, including after recreating the synchronizer", async () => {
    failPin = true;
    await run();
    expect(db.select().from(schema.PinnedPost).all()).toEqual([]);
    failPin = false;
    await run({ synchronizers: [{ ...synchronizer }] });
    expect(syncPost).toHaveBeenCalledTimes(1);
    expect(getTweet).toHaveBeenCalledTimes(1);
    expect(setPostPinned).toHaveBeenCalledTimes(2);
    expect(db.select().from(schema.PinnedPost).get()?.tweetId).toBe("old");
  });

  test("a failed replacement leaves the old managed state available for retry", async () => {
    await run();
    pinnedTweetIds = ["new"];
    failPin = true;
    await run();
    expect(db.select().from(schema.PinnedPost).get()?.tweetId).toBe("old");
    failPin = false;
    await run();
    expect(syncPost).toHaveBeenCalledTimes(2);
    expect(db.select().from(schema.PinnedPost).get()?.tweetId).toBe("new");
  });

  test("missing source metadata does not remove a pin", async () => {
    await run();
    setPostPinned.mockClear();
    pinnedTweetIds = undefined;
    await run();
    expect(setPostPinned).not.toHaveBeenCalled();
    expect(db.select().from(schema.PinnedPost).get()?.tweetId).toBe("old");
  });

  test("failed source lookup does not remove a pin", async () => {
    await run();
    setPostPinned.mockClear();
    await run({
      x: {
        getProfile: async () => {
          throw new Error("X unavailable");
        },
        getTweet,
      },
    });
    expect(setPostPinned).not.toHaveBeenCalled();
    expect(db.select().from(schema.PinnedPost).get()?.tweetId).toBe("old");
  });

  test("a missing replacement tweet does not remove the old pin", async () => {
    await run();
    pinnedTweetIds = ["missing"];
    getTweet.mockImplementation(async () => null);
    setPostPinned.mockClear();
    await run();
    expect(setPostPinned).not.toHaveBeenCalled();
    expect(db.select().from(schema.PinnedPost).get()?.tweetId).toBe("old");
  });

  test("opt-out leaves managed pins unchanged and makes no source requests", async () => {
    await run();
    getProfile.mockClear();
    setPostPinned.mockClear();
    pinnedTweetIds = [];
    await run({ enabled: false });
    expect(getProfile).not.toHaveBeenCalled();
    expect(setPostPinned).not.toHaveBeenCalled();
    expect(db.select().from(schema.PinnedPost).get()?.tweetId).toBe("old");
  });

  test("destinations without pin support still receive the post only once", async () => {
    const { setPostPinned: _, ...ordinary } = synchronizer;
    await run({ synchronizers: [ordinary] });
    await run({ synchronizers: [ordinary] });
    expect(syncPost).toHaveBeenCalledTimes(1);
    expect(setPostPinned).not.toHaveBeenCalled();
    expect(db.select().from(schema.PinnedPost).all()).toEqual([]);
  });

  test("a failing destination does not prevent another destination from syncing", async () => {
    const failure = {
      ...synchronizer,
      platformId: "broken",
      setPostPinned: async () => {
        throw new Error("Unavailable");
      },
    };
    await run({ synchronizers: [failure, synchronizer] });
    expect(getTweet).toHaveBeenCalledTimes(1);
    expect(db.select().from(schema.PinnedPost).all()).toEqual([
      { userHandle: "source", platform: "test", tweetId: "old" },
    ]);
  });

  test("pin state is isolated by source account", async () => {
    await run();
    pinnedTweetIds = [];
    setPostPinned.mockClear();
    await run({ handle: { ...handle, handle: "other", postFix: 1, slot: 1 } });
    expect(setPostPinned).not.toHaveBeenCalled();
    expect(db.select().from(schema.PinnedPost).get()?.userHandle).toBe(
      "source",
    );
  });

  test("factory validation preserves the pin capability", async () => {
    const factory = defineSynchronizerFactory({
      DISPLAY_NAME: "Test",
      PLATFORM_ID: "test",
      EMOJI: "T",
      ENV_SCHEMA: z.object({}),
      STORE_SCHEMA: storeSchema,
      async create() {
        return { setPostPinned };
      },
    });
    const created = await factory.create({
      xClient: {} as never,
      env: {},
      db,
      slot: 0,
      log: {} as never,
    });
    expect(typeof created.setPostPinned).toBe("function");
  });
});

test("migration preserves existing v1 posts and advances the database version", async () => {
  const sqlite = new Database(":memory:");
  try {
    sqlite.exec(v1);
    sqlite.exec(
      "INSERT INTO version VALUES (1, 1); INSERT INTO tweet_map VALUES ('old', 'test', '{}');",
    );
    const db = await migrate(drizzle({ client: sqlite }));
    expect(db.select().from(schema.Version).get()?.version).toBe(2);
    expect(db.select().from(schema.TweetMap).get()?.tweetId).toBe("old");
    expect(db.select().from(schema.PinnedPost).all()).toEqual([]);
  } finally {
    sqlite.close();
  }
});
