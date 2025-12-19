import { type DBType } from "db";
// Import * as v2 from "./schema/v2";
// import * as v3 from "./schema/v3";
// import * as v4 from "./schema/v4";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import { type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as v1 from "./schema/v1";

export const schemas = [{}, v1];
// Export const latestSchema = schemas[schemas.length - 1];

export async function migrate(
  db: BunSQLiteDatabase<{ Version: typeof v1.Version }>,
): Promise<DBType> {
  let currentVersion = 0;
  try {
    // 1. Try to get the current version.
    // This will fail if the table or row doesn't exist.
    const result = db.select().from(v1.Version).get();
    currentVersion = result?.version || 0;
    console.log(`Current database version: ${currentVersion}`);
  } catch {
    // 2. If it fails, assume version 0.
    console.log("Could not determine database version, assuming 0.");
  }

  // Fix Bigint issue
  currentVersion = Number(currentVersion);

  for (let i = currentVersion + 1; i < schemas.length; i++) {
    const previousSchema = schemas[i - 1];
    const currSchema = schemas[i];

    console.log(`Generating migration from v${i - 1} to v${i}...`);

    const migrationStatements = await generateSQLiteMigration(
      await generateSQLiteDrizzleJson(previousSchema),
      await generateSQLiteDrizzleJson(currSchema),
    );

    if (migrationStatements.length === 0) {
      console.log("No schema changes detected.");
      continue;
    }

    try {
      // Run all migration statements within a transaction
      for (const s of migrationStatements) {
        console.log("Executing:", s);
        db.run(s);
      }

      // 4. Update the version in the database
      // Ensure the table exists
      db.run(
        "CREATE TABLE IF NOT EXISTS version (id INTEGER PRIMARY KEY, version INTEGER);",
      );
      // Use INSERT OR REPLACE (UPSERT) to set the new version
      db.run(`INSERT OR REPLACE INTO version (id, version) VALUES (1, ${i})`);
      console.log(`✅ Migrated successfully to version ${i}`);
    } catch (error) {
      console.error(`Migration to v${i} failed:`, error);
      // If a migration fails, stop the process
      // return;
      throw new Error("Migration failed...");
    }
  }

  if (currentVersion === schemas.length - 1) {
    console.log("Database is already up to date.");
  }

  return db as DBType;
}
