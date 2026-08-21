import { describe, expect, test } from "vitest";
import { toScriptcRequestInit } from "./scriptc-fetch";

describe("toScriptcRequestInit", () => {
  test("removes browser policy options rejected by ScriptC", () => {
    expect(
      toScriptcRequestInit({
        method: "POST",
        credentials: "omit",
        cache: "no-cache",
        body: "payload",
      }),
    ).toEqual({ method: "POST", body: "payload" });
  });
});
