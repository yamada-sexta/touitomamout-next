import { describe, expect, test } from "vitest";
import { AuthenticationError } from "@the-convocation/twitter-scraper";
import {
  formatTwitterAuthError,
  parseTwitterCookies,
  X_AUTH_DOCUMENTATION_URL,
} from "./x-auth";

describe("parseTwitterCookies", () => {
  test("parses a browser Cookie request header", () => {
    expect(parseTwitterCookies("auth_token=token; ct0=csrf; lang=en")).toEqual([
      "auth_token=token",
      "ct0=csrf",
      "lang=en",
    ]);
  });

  test("requires the cookies used for an authenticated X session", () => {
    expect(() => parseTwitterCookies("lang=en; ct0=csrf")).toThrow(
      "TWITTER_COOKIES is missing auth_token",
    );
  });
});

describe("formatTwitterAuthError", () => {
  test("replaces the dependency's error 399 advice with app instructions", () => {
    const message = formatTwitterAuthError(
      new AuthenticationError("suspicious activity (error 399)"),
      false,
    );

    expect(message).toContain("TWITTER_COOKIES");
    expect(message).toContain(X_AUTH_DOCUMENTATION_URL);
    expect(message).not.toContain("scraper.setCookies()");
    expect(message).not.toContain("totp_secret");
  });

  test("reports when supplied cookies did not prevent error 399", () => {
    expect(
      formatTwitterAuthError(
        new AuthenticationError("suspicious activity (error 399)"),
        true,
      ),
    ).toContain("supplied cookies were rejected or expired");
  });

  test("does not mistake guest access for a successful Cloudflare login", () => {
    const message = formatTwitterAuthError(
      new Error(
        'Response status: 403 | headers: "cf-ray: abc-ORD\\nserver: cloudflare"',
      ),
      false,
    );

    expect(message).toContain("Cloudflare rejected");
    expect(message).toContain("guest");
    expect(message).toContain("TWITTER_COOKIES");
    expect(message).toContain(X_AUTH_DOCUMENTATION_URL);
  });
});
