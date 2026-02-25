FROM node:20-alpine

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/types/package.json packages/types/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @aquita/api prisma:generate
RUN pnpm --filter @aquita/api build

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "dist/main.js"]
