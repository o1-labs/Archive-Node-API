# Stage 1: Build the TypeScript code
# Pinned by digest for reproducible, tamper-evident builds; Dependabot's docker
# ecosystem keeps it current. Bump both stages together.
FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS build
WORKDIR /app

# Artillery pulls Playwright for benchmark tooling, but Docker builds only need
# the TypeScript server artifacts.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

# Stage 2: Runtime
FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019
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
