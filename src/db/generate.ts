import { mkdir, writeFile } from "node:fs/promises";
import * as v1 from "./schema/v1";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";

const OUT_DIR = "src/db/sql";
const schemas = [{}, v1];

function makeInitialMigrationIdempotent(sql: string): string {
  return sql
    .replace(/^CREATE TABLE /gm, "CREATE TABLE IF NOT EXISTS ")
    .replace(
      /^CREATE (UNIQUE )?INDEX /gm,
      (_match, unique: string | undefined) =>
        `CREATE ${unique ?? ""}INDEX IF NOT EXISTS `,
    );
}

async function main() {
  console.log("Generating migrations...");
  await mkdir(OUT_DIR, { recursive: true });

  const migrations: string[] = [];

  for (let i = 1; i < schemas.length; i++) {
    const prev = schemas[i - 1]!;
    const curr = schemas[i]!;

    console.log(`Generating v${i - 1} -> v${i}...`);
    const diff = await generateSQLiteMigration(
      await generateSQLiteDrizzleJson(prev as Record<string, unknown>),
      await generateSQLiteDrizzleJson(curr as Record<string, unknown>),
    );

    const fileName = `migration_v${i}.sql`;
    const filePath = `${OUT_DIR}/${fileName}`;

    const generatedSql = `${diff
      .map((statement) => statement.trim().replace(/;$/, ""))
      .filter(Boolean)
      .join(";\n")};\n`;
    const sqlContent =
      i === 1
        ? makeInitialMigrationIdempotent(generatedSql)
        : generatedSql;
    await writeFile(filePath, sqlContent);
    console.log(`Saved ${filePath}`);

    migrations.push(fileName);
  }

  // Generate index.ts
  const imports = migrations
    .map((m, idx) => `import v${idx + 1} from "./${m}";`)
    .join("\n");

  const exports = `export default [${migrations.map((_, idx) => `v${idx + 1}`).join(", ")}];`;

  const indexContent = `${imports}\n\n${exports}\n`;
  await writeFile(`${OUT_DIR}/index.ts`, indexContent);
  console.log("Generated index.ts");
}

main().catch(console.error);
