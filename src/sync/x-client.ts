import { Scraper } from "@the-convocation/twitter-scraper";
import { DBType, Schema } from "db";
import { eq } from "drizzle-orm";
import ora from "ora";
import { Cookie } from "tough-cookie";
import { oraPrefixer } from "utils/logs";
import { cycleTLSFetch, cycleTLSExit } from '@the-convocation/twitter-scraper/cycletls';

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
    prefixText: oraPrefixer("𝕏 client"),
  }).start("connecting to twitter...");

  const client = new Scraper({
    // fetch: fetch,
    fetch: cycleTLSFetch as typeof fetch,
    rateLimitStrategy: {
      async onRateLimit(e) {
        // console.log(e)
        throw new Error("Rate limited");
      },
    },
  });
  if (!twitterPassword || !twitterUsername) {
    log.warn("connected as guest | replies will not be synced");
    return client;
  }

  try {
    const prevCookie = await db
      .select()
      .from(Schema.TwitterCookieCache)
      .where(eq(Schema.TwitterCookieCache.userHandle, twitterUsername));
    const cookie = prevCookie.length ? prevCookie[0].cookie : null;

    if (cookie) {
      const cookies: Cookie[] = (JSON.parse(cookie) as unknown[])
        .map((o) => Cookie.fromJSON(o) as Cookie)
        .filter((o) => o);
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
    // await handleTwitterAuth(twitterClient);
  } catch (e) {
    log.warn(`Unable to login: ${e}`);
  } finally {
    log.stop();
  }

  return client;
}
