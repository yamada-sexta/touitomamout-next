import Database from "better-sqlite3";
import { migrate } from "~/db/migration";
import * as schema from "~/db/schema/v1";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { DATABASE_PATH } from "~/env";

export const Schema = schema;

const sqlite = new Database(DATABASE_PATH);
sqlite.defaultSafeIntegers(true);
export type DBType = BetterSQLite3Database<typeof Schema>;

export const db: DBType = await migrate(
  drizzle({
    client: sqlite,
  }),
);
// Await migrate(db);
