FROM oven/bun:1.3-debian AS bun

FROM node:24-trixie-slim AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential clang cmake lld libsqlite3-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app
COPY package.json bun.lock tsconfig.json /app/
COPY packages/scriptc-app/package.json packages/scriptc-app/index.d.ts /app/packages/scriptc-app/
RUN bun install --frozen-lockfile

COPY src/ /app/src/
COPY native/ /app/native/
RUN bun run build

FROM debian:trixie-slim

ARG COMMIT_HASH=dev
ENV TOUITOMAMOUT_COMMIT_HASH=$COMMIT_HASH

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libsqlite3-0 zlib1g \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/dist/touitomamout /usr/local/bin/touitomamout

WORKDIR /app
CMD ["/usr/local/bin/touitomamout"]
