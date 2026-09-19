# ZipWiki API — Phase 1b health host (parse / OKF / MCP land later).
FROM node:22-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@11.11.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/typescript-config/package.json packages/typescript-config/
COPY apps/server/package.json apps/server/

RUN pnpm install --frozen-lockfile --filter @zipwiki/server...

COPY packages/typescript-config packages/typescript-config
COPY apps/server apps/server

RUN pnpm --filter @zipwiki/server... build

FROM node:22-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/typescript-config ./packages/typescript-config
COPY --from=build /app/apps/server ./apps/server

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

WORKDIR /app/apps/server
EXPOSE 3001

CMD ["node", "dist/index.js"]
