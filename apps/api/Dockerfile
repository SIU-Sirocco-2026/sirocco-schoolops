FROM node:22.16.0-alpine@sha256:41e4389f3d988d2ed55392df4db1420ad048ae53324a8e2b7c6d19508288107e AS build
RUN npm install --global pnpm@11.25.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
RUN pnpm --filter @sirocco/api build
ENV NODE_ENV=production
ARG SOURCE_REVISION=unknown
ARG APP_VERSION=dev
LABEL org.opencontainers.image.revision=$SOURCE_REVISION org.opencontainers.image.version=$APP_VERSION
USER node
CMD ["node", "apps/api/dist/server.js"]
