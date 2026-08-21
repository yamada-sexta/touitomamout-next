import { start } from "@touitomamout/app";

declare function nativeDatabaseOpen(path: string): number;
declare function nativeDatabaseClose(): void;
declare function nativeDatabaseExec(sql: string): number;
declare function nativeDatabaseQuery(sql: string): number;
declare function nativeDatabaseQueryResultLength(): number;
declare function nativeDatabaseQueryResultByte(index: number): number;

let shuttingDown = false;
const shutdown = (signal: "SIGINT" | "SIGTERM") => {
  if (shuttingDown) {
    process.exit(signal === "SIGINT" ? 130 : 143);
  }

  shuttingDown = true;
  console.log(`\nReceived ${signal}. Stopping...`);
  nativeDatabaseClose();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await start(
  (path) => nativeDatabaseOpen(path),
  () => nativeDatabaseClose(),
  (sql) => nativeDatabaseExec(sql),
  (sql) => nativeDatabaseQuery(sql),
  () => nativeDatabaseQueryResultLength(),
  (index) => nativeDatabaseQueryResultByte(index),
);
