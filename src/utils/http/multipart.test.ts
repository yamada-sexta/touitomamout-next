import { describe, expect, test } from "vitest";
import { encodeMultipart } from "./multipart";

describe("encodeMultipart", () => {
  test("encodes text and binary fields with a matching boundary", async () => {
    const { body, contentType } = await encodeMultipart([
      { name: "display_name", value: "WWWW" },
      {
        name: "avatar",
        value: new Blob([new Uint8Array([0, 1, 2])], { type: "image/png" }),
        filename: "profile.png",
      },
    ]);

    const boundary = contentType.slice("multipart/form-data; boundary=".length);
    const encoded = new TextDecoder("latin1").decode(body);
    expect(encoded).toContain(
      `--${boundary}\r\nContent-Disposition: form-data; name="display_name"\r\n\r\nWWWW\r\n`,
    );
    expect(encoded).toContain(
      'Content-Disposition: form-data; name="avatar"; filename="profile.png"\r\nContent-Type: image/png\r\n\r\n',
    );
    expect([...body]).toEqual(
      expect.arrayContaining([0, 1, 2]),
    );
    expect(encoded.endsWith(`--${boundary}--\r\n`)).toBe(true);
  });
});
