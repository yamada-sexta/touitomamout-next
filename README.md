# A Fork of the [Touitomamout](https://github.com/louisgrasset/touitomamout)

<p align="center">
  <a href="https://yamada-sexta.github.io/touitomamout/docs/discover">
    <img src="https://github.com/yamada-sexta/touitomamout/raw/main/.github/docs/touitomamout.svg" width="150px"/>
  </a>
</p>

[![Release](https://img.shields.io/github/package-json/v/yamada-sexta/touitomamout-next/main?label=release&color=#4c1)](https://github.com/yamada-sexta/touitomamout-next/releases)
[![License](https://img.shields.io/github/license/yamada-sexta/touitomamout-next?color=#4c1)](https://github.com/yamada-sexta/touitomamout-next/blob/main/LICENSE)
[![Contributors](https://img.shields.io/github/contributors/yamada-sexta/touitomamout-next)](https://github.com/yamada-sexta/touitomamout-next/graphs/contributors)
[![Issues](https://img.shields.io/github/issues/yamada-sexta/touitomamout-next)](https://github.com/yamada-sexta/touitomamout-next/issues)
[![Github Stars](https://img.shields.io/github/stars/yamada-sexta/touitomamout-next?color=ffe34e)](https://github.com/yamada-sexta/touitomamout-next)
[![GHCR](https://img.shields.io/badge/GHCR-ghcr.io%2Fyamada--sexta%2Ftouitomamout-086dd7?logo=github)](https://ghcr.io/yamada-sexta/touitomamout-next)
[![Docker](https://img.shields.io/github/actions/workflow/status/yamada-sexta/touitomamout-next/docker.yml?label=Docker)](https://github.com/yamada-sexta/touitomamout-next/actions/workflows/docker.yml)

An easy way to synchronize your posts on 𝕏 to other social media platforms.

## What's different about this Fork?

- Build on Bun
- Better default environment settings
- Multi account support
- More platforms

<img width="3743" height="1736" alt="banner" src="https://github.com/user-attachments/assets/54dda5f6-53fd-4959-8ff8-c87a229c3f13" />


## Supported platforms

- 🦣 [Mastodon](https://joinmastodon.org/)
- ☁️ [Bluesky](https://bsky.app/)
- Ⓜ️ [Misskey](https://misskey-hub.net/)
- 🇩 [Discord](https://discord.com/) (Webhook)

## Get started

### File Structure

Your directory should look like this before running the application:

```txt
touitomamout/
├── docker-compose.yml
├── .env
└── data/
    └── next/
```

### Docker Compose Setup

```yml
services:
  touitomamout:
    # Use a descriptive container name
    container_name: "touitomamout"

    # The Docker image for the application
    image: ghcr.io/yamada-sexta/touitomamout-next:latest

    # This policy ensures the container restarts automatically if it stops
    restart: unless-stopped

    # Load all variables from the .env file in the same directory
    env_file: ".env"

    # You can also set specific environment variables here
    environment:
      - DATABASE_PATH=/data/data.sqlite

    # Mount a local directory to persist data (like the database)
    # This ensures your post history isn't lost when the container is updated
    volumes:
      - ./data/next:/data
```

### Environment Variables `(.env)`

#### Single Account Setup

For a single user, define the variables without any numeric suffix. You only need to add variables for the platforms you want to sync to.

```bash
#--- 𝕏 (Twitter) Account Credentials (Required Handle, Optional Login) ---#
TWITTER_HANDLE=YourXHandle
# USERNAME and PASSWORD are not required but are recommended for a more stable session.
TWITTER_USERNAME=your_x_username
TWITTER_PASSWORD=YourXPassword

#--- ☁️ Bluesky Credentials (Optional) ---#
# If not set, BLUESKY_INSTANCE defaults to "bsky.social".
BLUESKY_INSTANCE=bsky.social
BLUESKY_IDENTIFIER=your-handle.bsky.social
BLUESKY_PASSWORD=xxxx-xxxx-xxxx-xxxx # Use an app password, not your main password

#--- 🦣 Mastodon Credentials (Optional) ---#
# If not set, MASTODON_INSTANCE defaults to "mastodon.social".
MASTODON_INSTANCE=https://mastodon.social
MASTODON_ACCESS_TOKEN=YourMastodonAccessToken

#--- Ⓜ️ Misskey Credentials (Optional) ---#
MISSKEY_INSTANCE=https://your-instance.net # e.g., misskey.io
MISSKEY_ACCESS_CODE=YourMisskeyApiToken # Generate this in Settings > API

#--- 🇩 Discord Webhook (Optional) ---#
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1234567890/abcde-fghij
```

#### Multi-Account Setup

This fork's key feature is multi-account support.

- The first account uses variables with no number suffix.
- The second account uses variables with the suffix 1.
- The third account uses variables with the suffix 2, and so on.

You can mix and match which platforms each account posts to.

`.env` example for three accounts:

```bash
# ==================================
# ======= FIRST ACCOUNT (0) ========
# ==================================
TWITTER_HANDLE=FirstXHandle
# This account will post to Bluesky and Discord
BLUESKY_IDENTIFIER=first-handle.bsky.social
BLUESKY_PASSWORD=xxxx-xxxx-xxxx-xxxx
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/111111111/xxxxxxxxxx

# ==================================
# ======= SECOND ACCOUNT (1) =======
# ==================================
TWITTER_HANDLE1=SecondXHandle
# This account will post to Mastodon (using the default instance: mastodon.social)
MASTODON_ACCESS_TOKEN1=yyyyyyyyyyyyyyyyyy

# ==================================
# ======= THIRD ACCOUNT (2) ========
# ==================================
TWITTER_HANDLE2=ThirdXHandle
# This account will post to Misskey
MISSKEY_INSTANCE2=https://misskey.io
MISSKEY_ACCESS_CODE2=zzzzzzzzzzzzzzzzzzzzzz
```



## Documentation

You'll find everything you need, from the project's discovery to its deployment, as well as its configuration and some technical deep dives.

[<img src="https://github.com/louisgrasset/touitomamout/raw/main/.github/docs/documentation-center.svg"  width="300px"/>](https://github.com/yamada-sexta/touitomamout/wiki)

