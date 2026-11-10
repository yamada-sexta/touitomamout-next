import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import ora from "ora";
import { BlueskySynchronizerFactory } from "./bluesky";
import { MastodonSynchronizerFactory } from "./mastodon/mastodon-sync";
import { MisskeySynchronizerFactory } from "./misskey/missky-sync";

const cid = "bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
const did = "did:plc:abcdefghijklmnopqrstuvwx";
const log = ora({ isSilent: true });
const createArgs = { xClient: {} as never, db: {} as never, slot: 0, log };

describe("destination pin APIs", () => {
  let server: Server<undefined>;
  let handler: (req: Request) => Response | Promise<Response>;
  beforeEach(() => {
    handler = () =>
      Response.json({ error: "Unexpected request" }, { status: 500 });
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (req) => handler(req),
    });
  });
  afterEach(() => server.stop(true));

  test("Mastodon pins the first thread status and unpins it idempotently", async () => {
    const requests: string[] = [];
    let pinned = false;
    handler = (req) => {
      const path = new URL(req.url).pathname;
      requests.push(`${req.method} ${path}`);
      if (path.endsWith("verify_credentials"))
        return Response.json({ id: "account" });
      if (path.endsWith("/pin")) pinned = true;
      if (path.endsWith("/unpin")) pinned = false;
      return Response.json({ id: "first", pinned });
    };
    const s = await MastodonSynchronizerFactory.create({
      ...createArgs,
      env: { MASTODON_INSTANCE: server.url, MASTODON_ACCESS_TOKEN: "test" },
    });
    const store = { tootIds: ["first", "second"] };
    await s.setPostPinned!({ log, store, pinned: true });
    await s.setPostPinned!({ log, store, pinned: true });
    await s.setPostPinned!({ log, store, pinned: false });
    await s.setPostPinned!({ log, store, pinned: false });
    expect(requests.filter((r) => r.startsWith("POST"))).toEqual([
      "POST /api/v1/statuses/first/pin",
      "POST /api/v1/statuses/first/unpin",
    ]);
  });

  test("Mastodon tolerates a previously managed pin that was deleted", async () => {
    handler = (req) =>
      new URL(req.url).pathname.endsWith("verify_credentials")
        ? Response.json({ id: "account" })
        : Response.json({ error: "Record not found" }, { status: 404 });
    const s = await MastodonSynchronizerFactory.create({
      ...createArgs,
      env: { MASTODON_INSTANCE: server.url, MASTODON_ACCESS_TOKEN: "test" },
    });
    await expect(
      s.setPostPinned!({ log, store: { tootIds: ["deleted"] }, pinned: false }),
    ).resolves.toBeUndefined();
    await expect(
      s.setPostPinned!({ log, store: { tootIds: ["deleted"] }, pinned: true }),
    ).rejects.toThrow();
  });

  test("Misskey uses profile pin APIs and keeps unrelated pins", async () => {
    const pins = new Set(["manual"]);
    const writes: string[] = [];
    handler = async (req) => {
      const path = new URL(req.url).pathname;
      if (path === "/api/i") return Response.json({ pinnedNoteIds: [...pins] });
      const { noteId } = await req.json();
      writes.push(`${path} ${noteId}`);
      if (path === "/api/i/pin") pins.add(noteId);
      else if (path === "/api/i/unpin") pins.delete(noteId);
      return new Response(null, { status: 204 });
    };
    const s = await MisskeySynchronizerFactory.create({
      ...createArgs,
      env: { MISSKEY_INSTANCE: server.url, MISSKEY_ACCESS_CODE: "test" },
    });
    const store = { id: "mirror" };
    await s.setPostPinned!({ log, store, pinned: true });
    await s.setPostPinned!({ log, store, pinned: true });
    await s.setPostPinned!({ log, store, pinned: false });
    await s.setPostPinned!({ log, store, pinned: false });
    expect(writes).toEqual(["/api/i/pin mirror", "/api/i/unpin mirror"]);
    expect([...pins]).toEqual(["manual"]);
  });

  test("Bluesky preserves profile fields, replaces the pin, and does not remove a different pin", async () => {
    let profile: Record<string, unknown> = {
      $type: "app.bsky.actor.profile",
      displayName: "Name",
      description: "Bio",
    };
    let readFailed = false;
    let writes = 0;
    handler = async (req) => {
      const path = new URL(req.url).pathname;
      if (path.endsWith("createSession"))
        return Response.json({
          did,
          handle: "test.bsky.social",
          accessJwt: "test",
          refreshJwt: "test",
        });
      if (path.endsWith("getRecord")) {
        if (readFailed)
          return Response.json(
            { error: "InternalServerError", message: "Unavailable" },
            { status: 500 },
          );
        return Response.json({
          uri: `at://${did}/app.bsky.actor.profile/self`,
          cid,
          value: profile,
        });
      }
      if (path.endsWith("putRecord")) {
        const body = await req.json();
        expect(body.swapRecord).toBe(cid);
        profile = body.record;
        writes++;
        return Response.json({
          uri: `at://${did}/app.bsky.actor.profile/self`,
          cid,
        });
      }
      return Response.json({ error: "Unexpected request" }, { status: 500 });
    };
    const s = await BlueskySynchronizerFactory.create({
      ...createArgs,
      env: {
        BLUESKY_INSTANCE: server.url,
        BLUESKY_IDENTIFIER: "test.bsky.social",
        BLUESKY_PASSWORD: "test",
      },
    });
    const first = { rkey: "first", cid };
    const second = { rkey: "second", cid };
    await s.setPostPinned!({ log, store: first, pinned: true });
    await s.setPostPinned!({ log, store: first, pinned: true });
    expect(writes).toBe(1);
    await s.setPostPinned!({ log, store: second, pinned: true });
    await s.setPostPinned!({ log, store: first, pinned: false });
    expect(profile).toMatchObject({
      displayName: "Name",
      description: "Bio",
      pinnedPost: { uri: `at://${did}/app.bsky.feed.post/second`, cid },
    });
    readFailed = true;
    await expect(
      s.setPostPinned!({ log, store: second, pinned: false }),
    ).rejects.toThrow();
    expect(writes).toBe(2);
    readFailed = false;
    await s.setPostPinned!({ log, store: second, pinned: false });
    expect(profile.pinnedPost).toBeUndefined();
    expect(profile.displayName).toBe("Name");
  });
});
