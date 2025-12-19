import { Scraper } from "@the-convocation/twitter-scraper";
import { type DBType, Schema } from "db";
import { eq } from "drizzle-orm";
import ora from "ora";
import { Cookie } from "tough-cookie";
import { debug, oraPrefix } from "utils/logs";
import { cycleTLSFetch } from "@the-convocation/twitter-scraper/cycletls";

export async function createTwitterClient({
  twitterPassword,
  twitterUsername,
  db,
}: {
  twitterUsername?: string;
  twitterPassword?: string;
  db: DBType;
}): Promise<Scraper> {
  const log = ora({
    color: "gray",
    prefixText: oraPrefix("𝕏 client"),
  }).start("connecting to twitter...");

  const client = new Scraper({
    // Fetch: fetch,
    fetch: cycleTLSFetch as typeof fetch,
    rateLimitStrategy: {
      async onRateLimit(e) {
        debug("Rate limited by X:", e);
        throw new Error("Rate limited by X");
      },
    },
  });
  if (!twitterPassword || !twitterUsername) {
    log.warn("connected as guest | replies will not be synced");
    return client;
  }

  try {
    const previousCookie = await db
      .select()
      .from(Schema.TwitterCookieCache)
      .where(eq(Schema.TwitterCookieCache.userHandle, twitterUsername));
    const cookie = previousCookie.length > 0 ? previousCookie[0].cookie : undefined;

    if (cookie) {
      const cookies: Cookie[] = (JSON.parse(cookie) as unknown[])
        .map((o) => Cookie.fromJSON(o)!)
        .filter(Boolean);
      await client.setCookies(cookies.map((c) => c.toString()));
    }

    const loggedIn = await client.isLoggedIn();
    if (loggedIn) {
      log.succeed("connected (session restored)");
    } else {
      // Handle restoration failure
      await client.login(twitterUsername, twitterPassword);
      log.succeed("connected (using credentials)");
    }

    if (await client.isLoggedIn()) {
      const cookies = await client.getCookies();
      const cookieString = JSON.stringify(cookies);
      await db
        .insert(Schema.TwitterCookieCache)
        .values({
          userHandle: twitterUsername,
          cookie: cookieString,
        })
        .onConflictDoUpdate({
          target: Schema.TwitterCookieCache.userHandle,
          set: {
            cookie: cookieString,
          },
        });
    }
  } catch (error) {
    log.warn(`Unable to login: ${error}`);
  } finally {
    log.stop();
  }

  return client;
}
