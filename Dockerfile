FROM oven/bun:alpine

# Install dependencies for cycleTLS
RUN apk add --no-cache ca-certificates libc6-compat

WORKDIR /app
COPY package.json bun.lock tsconfig.json /app/

RUN bun i --production

COPY src/ /app/src

CMD ["bun", "/src/index.ts"]
