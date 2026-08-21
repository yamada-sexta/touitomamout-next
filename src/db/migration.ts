import { type DBType } from "#app/db";
import migrations from "./sql";
import { validateDatabaseVersion } from "./version";

export async function migrate(db: DBType): Promise<DBType> {
  const currentVersion = validateDatabaseVersion(
    db.getVersion(),
    migrations.length,
  );
  console.log(`Current database version: ${currentVersion}`);

  for (let i = currentVersion + 1; i <= migrations.length; i += 1) {
    console.log(`Migrating to v${i}...`);
    const migrationScript = migrations[i - 1];
    if (!migrationScript)
      throw new Error(`No migration script found for v${i}.`);

    let transactionStarted = false;
    try {
      db.run("BEGIN IMMEDIATE");
      transactionStarted = true;
      db.run(migrationScript);
      db.run(
        "CREATE TABLE IF NOT EXISTS version (id INTEGER PRIMARY KEY, version INTEGER)",
      );
      db.run(`INSERT OR REPLACE INTO version (id, version) VALUES (1, ${i})`);
      db.run("COMMIT");
      transactionStarted = false;
      console.log(`Migrated successfully to version ${i}`);
    } catch (error) {
      let rollbackFailure = "";
      if (transactionStarted) {
        try {
          db.run("ROLLBACK");
        } catch (rollbackError) {
          rollbackFailure = `; rollback also failed: ${
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError)
          }`;
        }
      }
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`Migration to v${i} failed: ${reason}${rollbackFailure}`);
      throw new Error("Migration failed");
    }
  }

  if (currentVersion === migrations.length) {
    console.log("Database is already up to date.");
  }
  return db;
}
