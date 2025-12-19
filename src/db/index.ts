import {Database} from 'bun:sqlite';
import {migrate} from 'db/migration';
import * as schema from 'db/schema/v1';
import {type BunSQLiteDatabase, drizzle} from 'drizzle-orm/bun-sqlite';
import {DATABASE_PATH} from 'env';

export const Schema = schema;

const sqlite = new Database(DATABASE_PATH, {
	create: true,
	safeIntegers: true,
	strict: true,
});
export type DBType = BunSQLiteDatabase<typeof Schema>;

export const db: DBType = await migrate(drizzle({
	client: sqlite,
}));
// Await migrate(db);
