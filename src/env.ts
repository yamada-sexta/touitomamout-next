import { accessSync, constants } from "node:fs";
import { join } from "node:path";
import z from "zod";
import packageInfo from "../package.json" assert { type: "json" };

if (process.env.NODE_ENV !== "test") {
  const envPath = process.argv[2] ?? join(process.cwd(), ".env");
  if (envPath.endsWith("example")) {
    throw new Error("You should not use the example configuration file.");
  }

  try {
    accessSync(envPath, constants.F_OK);
  } catch {
    console.log("No suitable .env file found.");
  }
}

const trimTwitterHandle = (handle: string) =>
  handle.toLowerCase().trim().replaceAll("@", "");

export const TWITTER_HANDLES: TwitterHandle[] = [];
type TwitterHandleKey<T extends number | ""> = `TWITTER_HANDLE${T}`;
export type TwitterHandle<T extends number | "" = "" | number> = {
  env: TwitterHandleKey<T>;
  postFix: T;
  handle: string;
  slot: number;
};

let _handleCounter = 0;
let _twitterHandleKey: TwitterHandleKey<"" | number> = "TWITTER_HANDLE";
export const INSTANCE_IDS: string[] = [];
while (process.env[_twitterHandleKey]) {
  const handle = trimTwitterHandle(process.env[_twitterHandleKey]!);
  console.log(`Found ${_twitterHandleKey}: @${handle}`);
  TWITTER_HANDLES.push({
    env: _twitterHandleKey,
    handle,
    postFix: _handleCounter ? _handleCounter : "",
    slot: _handleCounter,
  });
  INSTANCE_IDS.push(handle.toLocaleLowerCase().replaceAll(" ", "_"));
  _handleCounter += 1;
  _twitterHandleKey = `TWITTER_HANDLE${_handleCounter}`;
}

const stringbool = z.stringbool();
export function envBool(key: string, defaultValue = false): boolean {
  if (process.env[key] === undefined) {
    return defaultValue;
  }

  const res = stringbool.safeParse(process.env[key]);
  if (!res.success) {
    console.warn(
      `Invalid boolean for env ${key}: ${process.env[key]}, using default ${defaultValue}`,
    );
    return defaultValue;
  }

  return res.data;
}

export function envInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (isNaN(parsed)) {
    console.warn(
      `Invalid integer for env ${key}: ${value}, using default ${defaultValue}`,
    );
    return defaultValue;
  }

  return parsed;
}

export const TWITTER_USERNAME = trimTwitterHandle(
  process.env.TWITTER_USERNAME ?? "",
);
export const TWITTER_PASSWORD = (process.env.TWITTER_PASSWORD ?? "").trim();
export const DATABASE_PATH = (
  process.env.DATABASE_PATH ?? "data.sqlite"
).trim();
export const SYNC_MASTODON = envBool("SYNC_MASTODON", true);
export const SYNC_BLUESKY = envBool("SYNC_BLUESKY", true);
export const BACKDATE_BLUESKY_POSTS = envBool("BACKDATE_BLUESKY_POSTS", true);
export const SYNC_FREQUENCY_MIN = envInt("SYNC_FREQUENCY_MIN", 30);
export const SYNC_PROFILE_DESCRIPTION = envBool(
  "SYNC_PROFILE_DESCRIPTION",
  true,
);
export const SYNC_PROFILE_PICTURE = envBool("SYNC_PROFILE_PICTURE", true);
export const SYNC_PROFILE_NAME = envBool("SYNC_PROFILE_NAME", true);
export const SYNC_PROFILE_HEADER = envBool("SYNC_PROFILE_HEADER", true);
export const SYNC_DRY_RUN = envBool("SYNC_DRY_RUN", false);
export const DEBUG = envBool("TOUITOMAMOUT_DEBUG", false);

export const DAEMON = envBool("DAEMON", true);
export const VOID = "[VOID]";
export const API_RATE_LIMIT = envInt("API_RATE_LIMIT", 30);
export const TOUITOMAMOUT_VERSION = packageInfo.version ?? "UNKNOWN";
export const MASTODON_MAX_POST_LENGTH = 500;
export const BLUESKY_MAX_POST_LENGTH = 300;
export const BLUESKY_MEDIA_MAX_SIZE_BYTES = 976_560;
export const MAX_CONSECUTIVE_CACHED = envInt("MAX_CONSECUTIVE_CACHED", 2);
export const FORCE_SYNC_POSTS = envBool("FORCE_SYNC_POSTS", false);
export const SYNC_POSTS = envBool("SYNC_POSTS", true);
