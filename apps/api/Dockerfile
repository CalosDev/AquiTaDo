FROM node:20-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS prod-deps

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json

# Install only runtime deps for the API workspace.
RUN pnpm install --frozen-lockfile --prod --filter @aquita/api

FROM base AS build

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json

# Install build-time deps for API workspace.
RUN pnpm install --frozen-lockfile --filter @aquita/api

COPY apps/api apps/api

RUN pnpm --filter @aquita/api prisma:generate
RUN pnpm --filter @aquita/api build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=nodejs:nodejs /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build --chown=nodejs:nodejs /app/apps/api/dist /app/dist

RUN mkdir -p /app/uploads && chown nodejs:nodejs /app/uploads

USER nodejs

EXPOSE 3000

CMD ["node", "dist/main.js"]
