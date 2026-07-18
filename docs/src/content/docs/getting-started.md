---
title: Getting Started
description: Run Touitomamout with Docker or work on the application locally with Bun.
---

Docker is the recommended way to run Touitomamout. It provides a reproducible
runtime and keeps the synchronization database on the host.

## Run with Docker

Create a directory with the following structure:

```text
touitomamout/
├── docker-compose.yml
├── .env
└── data/
```

Create `docker-compose.yml`:

```yaml
services:
  touitomamout:
    container_name: "touitomamout"
    image: ghcr.io/yamada-sexta/touitomamout-next:latest
    restart: unless-stopped
    env_file: ".env"
    environment:
      - DATABASE_PATH=/data/database.sqlite
    volumes:
      - ./data:/data
```

Create `.env` using the [configuration reference](../configuration/), then
start the service:

```sh
docker compose pull
docker compose up -d
```

Follow the application log while verifying a new setup:

```sh
docker compose logs -f touitomamout
```

### Update an installation

Pull the current image and recreate the container so that image and environment
changes take effect:

```sh
docker compose pull
docker compose up -d --force-recreate
```

:::note
`docker compose restart` does not reload values changed in `.env`.
:::

## Local development

Install [Bun](https://bun.sh/), clone the repository, and install its
dependencies:

```sh
git clone https://github.com/yamada-sexta/touitomamout-next.git
cd touitomamout-next
bun install
```

Run the application from source:

```sh
bun dev
```

The source checkout uses `.env` from the repository root. Copy `.env.example`
to `.env` and replace the example credentials before starting the application.
