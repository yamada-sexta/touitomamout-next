import { accessSync, constants, readFileSync } from "node:fs";
import { join } from "node:path";
import z from "zod";
import packageInfo from "../package.json" with { type: "json" };

function loadEnvironmentFile(path: string): void {
  const contents = readFileSync(path, "utf8");
  for (const sourceLine of contents.split("\n")) {
    const line = sourceLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const assignment = line.startsWith("export ") ? line.slice(7) : line;
    const separator = assignment.indexOf("=");
    if (separator <= 0) continue;

    const key = assignment.slice(0, separator).trim();
    let value = assignment.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

if (process.env.NODE_ENV !== "test") {
  const explicitEnvPath = process.argv.length > 2;
  const envPath = explicitEnvPath
    ? process.argv[2]!
    : join(process.cwd(), ".env");
  if (envPath.endsWith("example")) {
    throw new Error("You should not use the example configuration file.");
  }

  try {
    accessSync(envPath, constants.F_OK);
    loadEnvironmentFile(envPath);
  } catch {
    // Containers normally supply process.env directly and do not mount a
    // dotenv file. Only warn when the user explicitly requested a path.
    if (explicitEnvPath)
      console.warn(`Unable to load environment file: ${envPath}`);
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

export const INSTANCE_IDS: string[] = [];
const configuredHandles: {
  key: TwitterHandleKey<"" | number>;
  slot: number;
}[] = [];
for (const key of Object.keys(process.env)) {
  if (key === "TWITTER_HANDLE") {
    configuredHandles.push({ key, slot: 0 });
    continue;
  }
  if (!key.startsWith("TWITTER_HANDLE")) continue;
  const suffix = key.slice("TWITTER_HANDLE".length);
  if (!/^[1-9]\d*$/.test(suffix)) continue;
  configuredHandles.push({
    key: key as TwitterHandleKey<number>,
    slot: Number(suffix),
  });
}
configuredHandles.sort((left, right) => left.slot - right.slot);

for (const { key, slot } of configuredHandles) {
  const handle = trimTwitterHandle(process.env[key] ?? "");
  if (!handle) {
    console.warn(`Ignoring empty ${key}`);
    continue;
  }
  console.log(`Found ${key}: @${handle}`);
  TWITTER_HANDLES.push({
    env: key,
    handle,
    postFix: slot === 0 ? "" : slot,
    slot,
  });
  INSTANCE_IDS.push(handle.toLowerCase().replaceAll(" ", "_"));
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
  console.log(`${key}=${res.data}`);
  return res.data;
}

export function envInt(
  key: string,
  defaultValue: number,
  minimum = Number.NEGATIVE_INFINITY,
): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
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
export const TWITTER_COOKIES = (process.env.TWITTER_COOKIES ?? "").trim();
export const DATABASE_PATH = (
  process.env.DATABASE_PATH ?? "data.sqlite"
).trim();
export const SYNC_MASTODON = envBool("SYNC_MASTODON", true);
export const SYNC_BLUESKY = envBool("SYNC_BLUESKY", true);
export const BACKDATE_BLUESKY_POSTS = envBool("BACKDATE_BLUESKY_POSTS", true);
export const SYNC_FREQUENCY_MIN = envInt("SYNC_FREQUENCY_MIN", 30, 1);
export const SYNC_PROFILE_DESCRIPTION = envBool(
  "SYNC_PROFILE_DESCRIPTION",
  true,
);
export const SYNC_PROFILE_PICTURE = envBool("SYNC_PROFILE_PICTURE", true);
export const FORCE_SYNC_PROFILE_PICTURE = envBool(
  "FORCE_SYNC_PROFILE_PICTURE",
  false,
);
export const SYNC_PROFILE_NAME = envBool("SYNC_PROFILE_NAME", true);
export const SYNC_PROFILE_HEADER = envBool("SYNC_PROFILE_HEADER", true);
export const FORCE_SYNC_PROFILE_HEADER = envBool(
  "FORCE_SYNC_PROFILE_HEADER",
  false,
);
export const DEBUG = envBool("TOUITOMAMOUT_DEBUG", false);

export const DAEMON = envBool("DAEMON", true);
export const VOID = "[VOID]";
export const TOUITOMAMOUT_VERSION = packageInfo.version ?? "UNKNOWN";
export const TOUITOMAMOUT_COMMIT_HASH =
  process.env.TOUITOMAMOUT_COMMIT_HASH?.trim() || "dev";
export const MASTODON_MAX_POST_LENGTH = 500;
export const BLUESKY_MAX_POST_LENGTH = 300;
export const BLUESKY_MEDIA_MAX_SIZE_BYTES = 976_560;
export const BLUESKY_VIDEO_DIRECT_UPLOAD_LIMIT_BYTES = 100_000_000;
export const BLUESKY_VIDEO_SERVICE_MAX_SIZE_BYTES = 300_000_000;
export const MAX_CONSECUTIVE_CACHED = envInt("MAX_CONSECUTIVE_CACHED", 2, 0);
export const FORCE_SYNC_POSTS = envBool("FORCE_SYNC_POSTS", false);
export const SYNC_POSTS = envBool("SYNC_POSTS", true);

export const HANDLE_RETWEETS = z
  .literal(["embed", "repost", "none"])
  .default("repost")
  .parse(process.env.HANDLE_RETWEETS);

export const X_EMB_FIX = z
  .literal(["vxtwitter.com", "fxtwitter.com", "fixupx.com"])
  .default("fxtwitter.com")
  .parse(process.env.X_EMB_FIX);

export const BSKY_EMB_FIX = z
  .literal(["fxbsky.app"])
  .default("fxbsky.app")
  .parse(process.env.BSKY_EMB_FIX);

export const CRON_JOB_SCHEDULE = process.env.CRON_JOB_SCHEDULE?.trim() || "";

export const HISTORICAL_SYNC_LIMIT = envInt(
  "HISTORICAL_SYNC_LIMIT",
  Infinity,
  0,
);

export const SYNC_RETWEETS = envBool("SYNC_RETWEETS", true);

export function getPostAppend(postFix: string | number): string {
  return (process.env[`POST_APPEND${postFix}`] ?? "").trim();
}

// const SEPARATOR = /\s/;
// Post separator is a regex string that indicates a break of a single post when it is too long.
export const POST_SEPARATOR = process.env.POST_BREAK
  ? new RegExp(process.env.POST_BREAK)
  : /\s/; // Replace /\s/ with whatever default regex you want
