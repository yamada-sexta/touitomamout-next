import { describe, expect, test } from "vitest";
import { validateDatabaseVersion } from "./version";

describe("validateDatabaseVersion", () => {
  test.each([Number.NaN, -1, 0.5, Number.POSITIVE_INFINITY])(
    "rejects corrupt version %s",
    (version) => {
      expect(() => validateDatabaseVersion(version, 1)).toThrow(
        "Invalid database version",
      );
    },
  );

  test("rejects a database created by a newer app", () => {
    expect(() => validateDatabaseVersion(2, 1)).toThrow("newer");
  });

  test.each([0, 1])("accepts supported version %s", (version) => {
    expect(validateDatabaseVersion(version, 1)).toBe(version);
  });
});
