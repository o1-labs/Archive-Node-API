# Stage 1: Build the TypeScript code
# Pinned by digest for reproducible, tamper-evident builds; Dependabot's docker
# ecosystem keeps it current. Bump both stages together.
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2
WORKDIR /app

# tini as PID 1: forwards SIGTERM to node (so graceful shutdown runs) and reaps zombies.
RUN apk add --no-cache tini

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package*.json ./
COPY schema.graphql ./

# Don't run as root
RUN addgroup -g 1001 -S nodejs \
  && adduser -S nodeuser -u 1001 \
  && chown -R nodeuser:nodejs /app
USER nodeuser

EXPOSE 8080

# Liveness check against the built-in endpoint (honours $PORT, defaults to 8080).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8080}/healthcheck" || exit 1

# Run node directly under tini (not via npm) so the process is a direct child of
# PID 1 and receives signals for graceful shutdown.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "build/src/index.js"]
