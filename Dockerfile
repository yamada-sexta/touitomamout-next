FROM node:22-alpine

ARG TARGETARCH
ARG COMMIT_HASH=dev
ENV TOUITOMAMOUT_COMMIT_HASH=$COMMIT_HASH

# Install dependencies for cycleTLS and native builds
RUN apk add --no-cache ca-certificates libc6-compat g++ make python3

WORKDIR /app
COPY package.json tsconfig.json /app/

RUN npm install --omit=dev && \
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
    find /app/node_modules -type f \( -name "*.md" -o -name "*.map" -o -name "*.d.ts" \) -delete

COPY src/ /app/src

CMD ["node", "--import", "tsx/esm", "/app/src/index.ts"]
