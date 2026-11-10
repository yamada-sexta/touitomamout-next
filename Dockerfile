FROM oven/bun:1.4.4-alpine

ARG TARGETARCH
ARG COMMIT_HASH=dev
ENV TOUITOMAMOUT_COMMIT_HASH=$COMMIT_HASH

# Install dependencies for cycleTLS
RUN apk upgrade --no-cache && apk add --no-cache ca-certificates gcompat

WORKDIR /app
COPY package.json bun.lock tsconfig.json /app/

# Install, clean cycletls, wipe Bun cache, AND prune useless files!
RUN bun install --production --frozen-lockfile --no-cache && \
    cd /app/node_modules/cycletls/dist && \
    if [ "$TARGETARCH" = "arm64" ]; then \
    rm -f index index-arm index.exe index-freebsd index-mac index-mac-arm64; \
    elif [ "$TARGETARCH" = "amd64" ]; then \
    rm -f index-arm index-arm64 index.exe index-freebsd index-mac index-mac-arm64; \
    elif [ "$TARGETARCH" = "arm" ]; then \
    rm -f index index-arm64 index.exe index-freebsd index-mac index-mac-arm64; \
    else \
    rm -f index.exe index-freebsd index-mac index-mac-arm64; \
    fi && \
    rm -rf /root/.bun/install/cache && \
    find /app/node_modules -type f \( -name "*.md" -o -name "*.map" -o -name "*.d.ts" \) -delete

COPY src/ /app/src

CMD ["bun", "/app/src/index.ts"]
