# --- Stage 1: Build ---
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc* ./
COPY apps/web/package.json apps/web/
COPY packages/schemas/package.json packages/schemas/
COPY packages/game-client/package.json packages/game-client/
COPY packages/game-config/package.json packages/game-config/
COPY packages/game-core/package.json packages/game-core/
COPY packages/config/package.json packages/config/

RUN pnpm install --frozen-lockfile --filter @dnw/web...

COPY apps/web/ apps/web/
COPY packages/schemas/ packages/schemas/
COPY packages/game-client/ packages/game-client/
COPY packages/game-config/ packages/game-config/
COPY packages/game-core/ packages/game-core/
COPY packages/config/ packages/config/

RUN pnpm --filter @dnw/web build

# --- Stage 2: Runtime ---
FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/package.json ./apps/web/
COPY --from=build /app/apps/web/next.config.ts ./apps/web/
COPY --from=build /app/apps/web/messages ./apps/web/messages

USER app
EXPOSE 3000
CMD ["node", "apps/web/node_modules/next/dist/bin/next", "start", "-p", "3000"]
