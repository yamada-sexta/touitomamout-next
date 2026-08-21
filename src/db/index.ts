export type PostStoreRow = { platformStore: string };
export type ProfileCacheRow = {
  pfpHash: string;
  pfpUrl: string;
  bannerHash: string;
  bannerUrl: string;
};

export type NativeDatabaseFunctions = {
  open: (path: string) => number;
  close: () => void;
  exec: (sql: string) => number;
  query: (sql: string) => number;
  queryResultLength: () => number;
  queryResultByte: (index: number) => number;
};

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function checkResult(operation: string, result: number): void {
  if (result !== 0) {
    throw new Error(`SQLite ${operation} failed with code ${result}`);
  }
}

export class Database {
  readonly #native: NativeDatabaseFunctions;

  constructor(path: string, native: NativeDatabaseFunctions) {
    this.#native = native;
    checkResult("open", native.open(path));
  }

  close(): void {
    this.#native.close();
  }

  run(sql: string): void {
    checkResult("statement", this.#native.exec(sql));
  }

  #query(sql: string): Record<string, string | null>[] {
    checkResult("query", this.#native.query(sql));
    const length = this.#native.queryResultLength();
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = this.#native.queryResultByte(i);
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<
      string,
      string | null
    >[];
  }

  hasTable(name: string): boolean {
    return (
      this.#query(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${quote(name)} LIMIT 1`,
      ).length > 0
    );
  }

  getVersion(): number {
    if (!this.hasTable("version")) return 0;
    const row = this.#query(
      "SELECT version FROM version WHERE id = 1 LIMIT 1",
    )[0];
    return row?.version === undefined || row.version === null
      ? 0
      : Number(row.version);
  }

  getPostStore(tweetId: string, platform: string): PostStoreRow | undefined {
    const row = this.#query(
      `SELECT platform_store FROM tweet_map WHERE tweet_id = ${quote(tweetId)} AND platform = ${quote(platform)} LIMIT 1`,
    )[0];
    const platformStore = row?.platform_store;
    return platformStore === undefined || platformStore === null
      ? undefined
      : { platformStore };
  }

  insertPostStore(
    tweetId: string,
    platform: string,
    platformStore: string,
  ): void {
    this.run(
      `INSERT INTO tweet_map (tweet_id, platform, platform_store) VALUES (${quote(tweetId)}, ${quote(platform)}, ${quote(platformStore)})`,
    );
  }

  isTweetSynced(tweetId: string): boolean {
    const row = this.#query(
      `SELECT synced FROM tweet_synced WHERE tweet_id = ${quote(tweetId)} LIMIT 1`,
    )[0];
    return (
      row?.synced !== undefined &&
      row.synced !== null &&
      Number(row.synced) !== 0
    );
  }

  markTweetSynced(tweetId: string): void {
    this.run(
      `INSERT INTO tweet_synced (tweet_id, synced) VALUES (${quote(tweetId)}, 1) ON CONFLICT(tweet_id) DO UPDATE SET synced = 1`,
    );
  }

  getCookie(userHandle: string): string | undefined {
    const cookie = this.#query(
      `SELECT cookie FROM cookies WHERE user_handle = ${quote(userHandle)} LIMIT 1`,
    )[0]?.cookie;
    return cookie === null ? undefined : cookie;
  }

  upsertCookie(userHandle: string, cookie: string): void {
    this.run(
      `INSERT INTO cookies (user_handle, cookie) VALUES (${quote(userHandle)}, ${quote(cookie)}) ON CONFLICT(user_handle) DO UPDATE SET cookie = excluded.cookie`,
    );
  }

  getProfile(userId: string): ProfileCacheRow | undefined {
    const row = this.#query(
      `SELECT pfp_hash, pfp_url, banner_hash, banner_url FROM profiles WHERE user_id = ${quote(userId)} LIMIT 1`,
    )[0];
    if (!row) return;
    return {
      pfpHash: row.pfp_hash ?? "",
      pfpUrl: row.pfp_url ?? "",
      bannerHash: row.banner_hash ?? "",
      bannerUrl: row.banner_url ?? "",
    };
  }

  upsertProfile(args: {
    userId: string;
    pfpHash: string;
    pfpUrl: string;
    bannerHash: string;
    bannerUrl: string;
  }): void {
    this.run(
      `INSERT INTO profiles (user_id, pfp_hash, pfp_url, banner_hash, banner_url) VALUES (${quote(args.userId)}, ${quote(args.pfpHash)}, ${quote(args.pfpUrl)}, ${quote(args.bannerHash)}, ${quote(args.bannerUrl)}) ON CONFLICT(user_id) DO UPDATE SET pfp_hash = excluded.pfp_hash, pfp_url = excluded.pfp_url, banner_hash = excluded.banner_hash, banner_url = excluded.banner_url`,
    );
  }
}

export type DBType = Database;
