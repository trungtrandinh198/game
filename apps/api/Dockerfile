# --- Stage 1: Build ---
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc* ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/schemas/package.json packages/schemas/
COPY packages/config/package.json packages/config/

RUN pnpm install --frozen-lockfile --filter @dnw/api...

COPY apps/api/ apps/api/
COPY packages/db/ packages/db/
COPY packages/schemas/ packages/schemas/
COPY packages/config/ packages/config/

RUN pnpm --filter @dnw/api build

# --- Stage 2: Runtime ---
FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/packages/schemas ./packages/schemas
COPY --from=build /app/packages/config ./packages/config
COPY --from=build /app/pnpm-workspace.yaml ./

USER app
EXPOSE 8080
CMD ["npx", "tsx", "apps/api/src/main.ts"]
