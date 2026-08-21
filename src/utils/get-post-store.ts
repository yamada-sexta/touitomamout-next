import { type Tweet } from "@the-convocation/twitter-scraper";
import { type DBType } from "#app/db";
import type z from "zod";

export async function getPostStoreStr({
  db,
  tweet,
  platformId,
}: {
  db: DBType;
  tweet?: string | Tweet;
  platformId: string;
}) {
  // Tweet can be either tweet object or tweet.id
  if (!tweet) {
    return;
  }

  const tid = typeof tweet === "string" ? tweet : tweet.id;
  if (!tid) {
    return;
  }

  return db.getPostStore(tid, platformId);
}

export async function getPostStore<S extends z.ZodObject = z.ZodObject>(args: {
  s: S;
  db: DBType;
  tweet?: Tweet | string;
  platformId: string;
}) {
  const string_ = await getPostStoreStr({ ...args });
  let platformStore: unknown;
  if (string_) {
    try {
      platformStore = JSON.parse(string_.platformStore);
    } catch {
      platformStore = undefined;
    }
  }

  const p = args.s.safeParse(platformStore);
  return p;
}
