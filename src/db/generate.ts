import { write } from "bun";
import { mkdir } from "node:fs/promises";
import { schemas } from "./migration";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";

const OUT_DIR = "src/db/sql";

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
      await generateSQLiteDrizzleJson(curr as Record<string, unknown>)
    );

    const fileName = `migration_v${i}.sql`;
    const filePath = `${OUT_DIR}/${fileName}`;
    
    // Join statements with semicolons for the file content
    const sqlContent = diff.join(";\n");
    await write(filePath, sqlContent);
    console.log(`Saved ${filePath}`);
    
    migrations.push(fileName);
  }

  // Generate index.ts
  const imports = migrations
    .map((m, idx) => `import v${idx + 1} from "./${m}" with { type: "text" };`)
    .join("\n");
  
  const exports = `export default [${migrations.map((_, idx) => `v${idx + 1}`).join(", ")}];`;
  
  const indexContent = `${imports}\n\n${exports}\n`;
  await write(`${OUT_DIR}/index.ts`, indexContent);
  console.log("Generated index.ts");
}

main().catch(console.error);
