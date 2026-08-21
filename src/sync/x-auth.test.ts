import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AuthenticationError } from "@the-convocation/twitter-scraper";
import {
  formatTwitterAuthError,
  parseTwitterCookies,
  X_AUTH_DOCUMENTATION_URL,
} from "./x-auth";

describe("parseTwitterCookies", () => {
  it("parses a browser Cookie request header", () => {
    assert.deepStrictEqual(
      parseTwitterCookies("auth_token=token; ct0=csrf; lang=en"),
      ["auth_token=token", "ct0=csrf", "lang=en"],
    );
  });

  it("requires the cookies used for an authenticated X session", () => {
    assert.throws(
      () => parseTwitterCookies("lang=en; ct0=csrf"),
      /TWITTER_COOKIES is missing auth_token/,
    );
  });
});

describe("formatTwitterAuthError", () => {
  it("replaces the dependency's error 399 advice with app instructions", () => {
    const message = formatTwitterAuthError(
      new AuthenticationError("suspicious activity (error 399)"),
      false,
    );

    assert.ok(message.includes("TWITTER_COOKIES"));
    assert.ok(message.includes(X_AUTH_DOCUMENTATION_URL));
    assert.ok(!message.includes("scraper.setCookies()"));
    assert.ok(!message.includes("totp_secret"));
  });

  it("reports when supplied cookies did not prevent error 399", () => {
    const message = formatTwitterAuthError(
      new AuthenticationError("suspicious activity (error 399)"),
      true,
    );
    assert.ok(message.includes("supplied cookies were rejected or expired"));
  });
});
