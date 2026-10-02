# Stage 1: Build the TypeScript code
# Pinned by digest for reproducible, tamper-evident builds; Dependabot's docker
# ecosystem keeps it current. Bump both stages together.
FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

# Stage 2: Runtime
FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4
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
