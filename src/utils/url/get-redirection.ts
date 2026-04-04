// Set a constant for the 30-second timeout in milliseconds
const TIMEOUT_MS = 30_000;

/**
 * Validates if a URL is safe to follow.
 * Restricts to http and https protocols and blocks private/loopback IP address ranges.
 * @param urlString - The URL string to validate.
 * @returns - True if the URL is safe, false otherwise.
 */
export function isSafeUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Only allow http and https protocols
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    const hostname = url.hostname;

    // Block common private and loopback IP addresses
    // Check for IPv4 loopback and private ranges
    const isIPv4Private =
      hostname === "127.0.0.1" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

    // Check for IPv6 loopback (::1) and common local addresses
    const isIPv6Private =
      hostname === "[::1]" ||
      hostname === "::1" ||
      hostname === "[0:0:0:0:0:0:0:1]" ||
      hostname === "0:0:0:0:0:0:0:1" ||
      hostname.startsWith("[fe80:") ||
      hostname.startsWith("fe80:");

    // Check for localhost
    const isLocalhost = hostname === "localhost";

    if (isIPv4Private || isIPv6Private || isLocalhost) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts the URL from a meta refresh tag in the HTML content.
 * @param html - The HTML content to search for a meta redirect.
 * @param baseUrl - The base URL for resolving relative URLs.
 * @returns - The redirect URL or undefined if not found.
 */
function extractMetaRefreshUrl(
  html: string,
  baseUrl: string,
): string | undefined {
  const metaTagMatch =
    /<meta\s+http-equiv=["']refresh["']\s+content=["']\d+;\s*url=(.*?)["']/i.exec(
      html,
    );
  const metaRedirectUrl = metaTagMatch?.[1];
  if (metaRedirectUrl) {
    const resolvedUrl = new URL(metaRedirectUrl, baseUrl).href;
    if (isSafeUrl(resolvedUrl)) {
      return resolvedUrl;
    }
  }

  return;
}

/**
 * Helper function to fetch a URL with a timeout and track redirection.
 * @param url - The shortened URL to be resolved.
 * @param hasRedirected - Boolean indicating if a redirection has occurred.
 * @returns - The final URL or undefined if it can't be resolved or no redirection happened.
 */
export const getRedirectedUrl = async (
  url: string,
  hasRedirected = false,
): Promise<string | undefined> => {
  if (!isSafeUrl(url)) {
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "manual", // No auto-redirects, handle them manually
      signal: controller.signal,
    });

    // Handle standard HTTP redirects (3xx status codes)
    if (response.status >= 300 && response.status < 400) {
      const redirectUrl = response.headers.get("location");
      if (redirectUrl) {
        const resolvedUrl = new URL(redirectUrl, url).href;
        return getRedirectedUrl(resolvedUrl, true); // Recursively resolve further redirects
      }
    }

    // If the response is an HTML page, check for meta tag redirection
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("text/html")) {
      const html = await response.text();
      const metaRedirectUrl = extractMetaRefreshUrl(html, url);
      if (metaRedirectUrl) {
        return getRedirectedUrl(metaRedirectUrl, true); // Recursively resolve meta tag redirects
      }
    }

    // If no redirection happened, return undefined
    return hasRedirected ? url : undefined;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      console.error("Request timed out");
    } else {
      console.error("Failed to resolve URL:", error);
    }

    return undefined;
  } finally {
    clearTimeout(timeout); // Clear the timeout on completion or error
  }
};
