# --- Stage 1: Build ---
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc* ./
COPY apps/realtime/package.json apps/realtime/
COPY packages/db/package.json packages/db/
COPY packages/schemas/package.json packages/schemas/
COPY packages/game-config/package.json packages/game-config/
COPY packages/game-core/package.json packages/game-core/
COPY packages/config/package.json packages/config/

RUN pnpm install --frozen-lockfile --filter @dnw/realtime...

COPY apps/realtime/ apps/realtime/
COPY packages/db/ packages/db/
COPY packages/schemas/ packages/schemas/
COPY packages/game-config/ packages/game-config/
COPY packages/game-core/ packages/game-core/
COPY packages/config/ packages/config/

RUN pnpm --filter @dnw/realtime build

# --- Stage 2: Runtime ---
FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/realtime ./apps/realtime
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/packages/schemas ./packages/schemas
COPY --from=build /app/packages/game-config ./packages/game-config
COPY --from=build /app/packages/game-core ./packages/game-core
COPY --from=build /app/packages/config ./packages/config
COPY --from=build /app/pnpm-workspace.yaml ./

USER app
EXPOSE 2567
CMD ["npx", "tsx", "apps/realtime/src/main.ts"]
