FROM oven/bun:1-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build:client

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "server/src/server.ts"]
