FROM oven/bun:alpine

ARG TARGETARCH

# Install dependencies for cycleTLS
RUN apk add --no-cache ca-certificates libc6-compat

WORKDIR /app
COPY package.json bun.lock tsconfig.json /app/

# Install, clean cycletls, wipe Bun cache, AND prune useless files!
RUN bun install --production --no-cache && \
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
    find /app/node_modules -type f \( -name "*.md" -o -name "*.map" -o -name "*.d.ts" -o -name "LICENSE" \) -delete

COPY src/ /app/src

CMD ["bun", "/src/index.ts"]