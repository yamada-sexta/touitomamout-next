import { describe, expect, test } from "vitest";
import { Database, type NativeDatabaseFunctions } from "./index";

function nativeFor(
  payload: string,
  length = new TextEncoder().encode(payload).length,
) {
  const bytes = new TextEncoder().encode(payload);
  const statements: string[] = [];
  const native: NativeDatabaseFunctions = {
    open: () => 0,
    close: () => undefined,
    exec: (sql) => {
      statements.push(sql);
      return 0;
    },
    query: () => 0,
    queryResultLength: () => length,
    queryResultByte: (index) => bytes[index] ?? 0,
  };
  return { native, statements };
}

describe("Database native bridge validation", () => {
  test.each([-1, 64 * 1024 * 1024 + 1, 1.5, Number.NaN])(
    "rejects invalid result length %s",
    (length) => {
      const { native } = nativeFor("[]", length);
      const db = new Database(":memory:", native);
      expect(() => db.hasTable("version")).toThrow("result length");
    },
  );

  test("rejects a non-array result payload", () => {
    const { native } = nativeFor('{"bad":true}');
    const db = new Database(":memory:", native);
    expect(() => db.hasTable("version")).toThrow("result payload");
  });

  test("does not treat corrupt synced values as true", () => {
    const { native } = nativeFor('[{"synced":"abc"}]');
    const db = new Database(":memory:", native);
    expect(db.isTweetSynced("42")).toBe(false);
  });

  test("upserts a platform store so forced retries remain idempotent", () => {
    const { native, statements } = nativeFor("[]");
    const db = new Database(":memory:", native);
    db.insertPostStore("42", "bluesky", "{}");
    expect(statements[0]).toContain("ON CONFLICT(tweet_id, platform)");
  });
});
