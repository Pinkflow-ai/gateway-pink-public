# Gateway.pink public gateway image.
# Node 24-alpine matches the runtime target in docs/architecture.md §2.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
# Build the TS to dist; the runtime image runs compiled JS.
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY --chown=node:node config ./config
# Drop privileges — the gateway has no reason to run as root.
USER node
EXPOSE 3000
# pino writes JSON to stdout; Promtail picks it up via the docker logger.
CMD ["node", "dist/server.js"]
