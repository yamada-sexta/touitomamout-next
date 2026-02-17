import { type DBType } from "db";
// Import * as v2 from "./schema/v2";
// import * as v3 from "./schema/v3";
// import * as v4 from "./schema/v4";
import { type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as v1 from "./schema/v1";
import migrations from "./sql";

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
    console.log(`Migrating to v${i}...`);

    const migrationScript = migrations[i - 1];

    if (!migrationScript) {
      console.log(`No migration script found for v${i}.`);
      continue;
    }

    try {
    // Run all migration statements within a transaction
      // Split by semicolon as sqlite run executes one statement at a time in some drivers, 
      const statements = migrationScript.split(";\n").filter((s) => s.trim() !== "");
      
      for (const s of statements) {
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
