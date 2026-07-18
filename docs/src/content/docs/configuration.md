---
title: Configuration
description: Configure source and destination credentials, synchronization behavior, scheduling, and multiple accounts.
---

Touitomamout reads configuration from environment variables. With Docker
Compose, place them in the `.env` file referenced by `env_file`. A source X
account and at least one complete destination credential set are required.

## X source

| Variable           | Default  | Description                                  |
| ------------------ | -------- | -------------------------------------------- |
| `TWITTER_HANDLE`   | Required | X username whose posts will be synchronized. |
| `TWITTER_USERNAME` | None     | Username used to authenticate the X scraper. |
| `TWITTER_PASSWORD` | None     | Password used to authenticate the X scraper. |

:::caution[Authentication]
`TWITTER_USERNAME` and `TWITTER_PASSWORD` are optional, but an authenticated
scraper session is substantially more reliable. Use a dedicated secondary
account to limit the risk associated with automated scraping. The scraper does
not support MFA challenges.
:::

## Destination platforms

A destination is enabled when all of its required credentials are present.
Account-specific destination variables use the numbering convention described
in [Multiple accounts](#multiple-accounts).

### Bluesky

| Variable             | Default       | Description                              |
| -------------------- | ------------- | ---------------------------------------- |
| `BLUESKY_INSTANCE`   | `bsky.social` | Bluesky PDS domain.                      |
| `BLUESKY_IDENTIFIER` | Required      | Bluesky handle or account email address. |
| `BLUESKY_PASSWORD`   | Required      | Bluesky app password.                    |

Use an app password instead of the account's main password. Create one under
**Settings → Privacy and security → App passwords** in Bluesky.

### Mastodon

| Variable                | Default           | Description                                                     |
| ----------------------- | ----------------- | --------------------------------------------------------------- |
| `MASTODON_INSTANCE`     | `mastodon.social` | Mastodon instance domain, with or without an `https://` prefix. |
| `MASTODON_ACCESS_TOKEN` | Required          | Access token used to publish posts and update the profile.      |

Create an application in the Mastodon instance settings with the
`read:accounts`, `write:media`, `write:statuses`, and `write:accounts` scopes.

### Misskey

| Variable              | Default  | Description                                                                              |
| --------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `MISSKEY_INSTANCE`    | Required | Misskey instance URL.                                                                    |
| `MISSKEY_ACCESS_CODE` | Required | API access token with permission to upload media, publish notes, and update the profile. |

### Discord webhook

| Variable              | Default  | Description                                   |
| --------------------- | -------- | --------------------------------------------- |
| `DISCORD_WEBHOOK_URL` | Required | Full webhook URL for the destination channel. |

Create a webhook from **Edit Channel → Integrations → Webhooks** in Discord.

### Tumblr

| Variable                 | Default  | Description                                    |
| ------------------------ | -------- | ---------------------------------------------- |
| `TUMBLR_CONSUMER_KEY`    | Required | OAuth consumer key for the Tumblr app.         |
| `TUMBLR_CONSUMER_SECRET` | Required | OAuth consumer secret for the Tumblr app.      |
| `TUMBLR_TOKEN`           | Required | OAuth access token for the target blog.        |
| `TUMBLR_TOKEN_SECRET`    | Required | OAuth access-token secret for the target blog. |

## Synchronization settings

| Variable                     | Default    | Description                                                                                         |
| ---------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `SYNC_MASTODON`              | `true`     | Enables Mastodon when its credentials are configured.                                               |
| `SYNC_BLUESKY`               | `true`     | Legacy setting that is currently not enforced. Omit Bluesky credentials to disable the destination. |
| `SYNC_POSTS`                 | `true`     | Enables post synchronization.                                                                       |
| `SYNC_RETWEETS`              | `true`     | Includes retweets. Set to `false` to skip them before destination handling.                         |
| `HANDLE_RETWEETS`            | `repost`   | Destination behavior for retweets: `repost`, `embed`, or `none`.                                    |
| `POST_APPEND`                | None       | Appends account-specific text after a blank line.                                                   |
| `POST_BREAK`                 | Whitespace | Regular expression used to recognize boundaries when splitting an over-length post.                 |
| `SYNC_PROFILE_NAME`          | `true`     | Synchronizes the profile display name.                                                              |
| `SYNC_PROFILE_DESCRIPTION`   | `true`     | Synchronizes the profile biography.                                                                 |
| `SYNC_PROFILE_PICTURE`       | `true`     | Synchronizes the profile avatar.                                                                    |
| `FORCE_SYNC_PROFILE_PICTURE` | `false`    | Uploads the avatar even when the cached image has not changed.                                      |
| `SYNC_PROFILE_HEADER`        | `true`     | Synchronizes the profile banner.                                                                    |
| `FORCE_SYNC_PROFILE_HEADER`  | `false`    | Uploads the banner even when the cached image has not changed.                                      |
| `BACKDATE_BLUESKY_POSTS`     | `true`     | Uses the original tweet date for mirrored Bluesky posts.                                            |

### Appending text to posts

Use `POST_APPEND` to add a standard string, such as hashtags, to newly mirrored
post text:

```bash
POST_APPEND="#example #hashtags"
```

The configured value is trimmed and separated from the original text by a
blank line. Keep values containing `#` quoted; an unquoted hash begins a comment
in an environment file.

The suffix participates in each platform's normal length handling. It appears
at the end of the final text chunk when a post is split, and becomes the text
of a media-only post. Embedded quoted-post content is not modified. Native
reposts and reblogs do not gain text because they republish an existing
destination post. The setting is not retroactive.

After changing `.env`, recreate a Docker container rather than restarting it:

```console
$ docker compose up -d --force-recreate
$ docker compose exec touitomamout printenv POST_APPEND
#example #hashtags
```

## System and scheduling

| Variable                 | Default         | Description                                                                                         |
| ------------------------ | --------------- | --------------------------------------------------------------------------------------------------- |
| `DAEMON`                 | `true`          | Runs continuously at an interval. Set to `false` for one execution.                                 |
| `SYNC_FREQUENCY_MIN`     | `30`            | Minutes between runs when daemon mode is active and no cron schedule is configured.                 |
| `DATABASE_PATH`          | `data.sqlite`   | SQLite database path used to track synchronization state.                                           |
| `TOUITOMAMOUT_DEBUG`     | `false`         | Enables verbose diagnostic logging.                                                                 |
| `MAX_CONSECUTIVE_CACHED` | `2`             | Stops a scan after this many consecutive cached posts.                                              |
| `FORCE_SYNC_POSTS`       | `false`         | Rechecks posts marked as synced. Destination caches can still skip posts that were already created. |
| `CRON_JOB_SCHEDULE`      | None            | Cron expression for scheduling runs. A cron schedule takes precedence over daemon intervals.        |
| `HISTORICAL_SYNC_LIMIT`  | Unlimited       | Maximum number of posts examined during the first sync after startup.                               |
| `X_EMB_FIX`              | `fxtwitter.com` | Fallback X embed domain: `fxtwitter.com`, `vxtwitter.com`, or `fixupx.com`.                         |

## Multiple accounts

Account-specific variables are `TWITTER_HANDLE`, `POST_APPEND`, and every
destination credential. The first account has no suffix, the second uses suffix
`1`, the third uses suffix `2`, and so on. Account numbers must be contiguous.

Source login variables and synchronization or scheduling settings are global;
do not add account suffixes to them. An account only uses its own `POST_APPEND`
value—there is no fallback from `POST_APPEND` to `POST_APPEND1`.

```bash
# First account: Bluesky and Discord
TWITTER_HANDLE=FirstXHandle
POST_APPEND="#firstAccount"
BLUESKY_IDENTIFIER=first-handle.bsky.social
BLUESKY_PASSWORD=xxxx-xxxx-xxxx-xxxx
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/111111111/xxxxxxxxxx

# Second account: Mastodon
TWITTER_HANDLE1=SecondXHandle
POST_APPEND1="#secondAccount"
MASTODON_ACCESS_TOKEN1=yyyyyyyyyyyyyyyyyy

# Third account: Misskey, without appended text
TWITTER_HANDLE2=ThirdXHandle
MISSKEY_INSTANCE2=https://misskey.io
MISSKEY_ACCESS_CODE2=zzzzzzzzzzzzzzzzzzzzzz
```
