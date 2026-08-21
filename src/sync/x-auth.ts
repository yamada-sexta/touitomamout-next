import { AuthenticationError } from "@the-convocation/twitter-scraper";
import { Cookie } from "tough-cookie";

export const X_AUTH_DOCUMENTATION_URL =
  "https://yamada-sexta.github.io/touitomamout-next/configuration/#cookie-based-authentication";

export class TwitterCookieError extends Error {
  override name = "TwitterCookieError";
}

export function parseTwitterCookies(cookieHeader: string): string[] {
  const cookies = cookieHeader
    .split(";")
    .map((value) => Cookie.parse(value.trim()))
    .filter((cookie): cookie is Cookie => cookie !== undefined);
  const cookieNames = new Set(cookies.map((cookie) => cookie.key));
  const missingCookies = ["auth_token", "ct0"].filter(
    (name) => !cookieNames.has(name),
  );

  if (missingCookies.length > 0) {
    throw new TwitterCookieError(
      `TWITTER_COOKIES is missing ${missingCookies.join(" and ")}`,
    );
  }

  return cookies.map((cookie) => cookie.toString());
}

export function formatTwitterAuthError(
  error: unknown,
  cookiesProvided: boolean,
): string {
  if (error instanceof TwitterCookieError) {
    return `Unable to authenticate with X: ${error.message}. Export a fresh Cookie request header from a logged-in browser. See ${X_AUTH_DOCUMENTATION_URL}`;
  }

  const errorText = String(error);
  if (
    /response status:\s*403/i.test(errorText) &&
    /(cf-ray|server:\s*cloudflare)/i.test(errorText)
  ) {
    return `Unable to authenticate with X: Cloudflare rejected the password-login transport (HTTP 403). Public requests may still work as a guest, but that does not mean authentication succeeded. Export fresh browser cookies into TWITTER_COOKIES. See ${X_AUTH_DOCUMENTATION_URL}`;
  }

  if (
    error instanceof AuthenticationError &&
    error.message.includes("error 399")
  ) {
    const reason = cookiesProvided
      ? "The supplied cookies were rejected or expired, and X blocked the credential login attempt (error 399)."
      : "X blocked the credential login attempt as suspicious (error 399).";

    return `Unable to authenticate with X: ${reason} Export fresh browser cookies into TWITTER_COOKIES. See ${X_AUTH_DOCUMENTATION_URL}`;
  }

  return `Unable to login: ${errorText}`;
}
