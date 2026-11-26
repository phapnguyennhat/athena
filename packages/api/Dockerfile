# Build context is the repo root (pnpm workspace): docker build -f packages/api/Dockerfile .
FROM node:24-alpine AS base
RUN npm i -g pnpm@11.7.0
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/api/package.json packages/api/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter api
COPY packages/api packages/api
RUN pnpm --filter api build

FROM base AS runtime
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --filter api --prod
COPY --from=build /repo/packages/api/dist packages/api/dist
WORKDIR /repo/packages/api
EXPOSE 8080
CMD ["node", "dist/main"]
