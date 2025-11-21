FROM oven/bun:alpine

# Install dependencies for cycleTLS
RUN apk add --no-cache ca-certificates libc6-compat

WORKDIR /app
COPY package.json bun.lock tsconfig.json /app/

RUN bun install

COPY src/ /app/src
# COPY scripts/ /app/scripts

CMD ["bun", "/src/index.ts"]
