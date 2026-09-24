# Stage 1: Build the TypeScript code
# Pinned by digest for reproducible, tamper-evident builds; Dependabot's docker
# ecosystem keeps it current. Bump both stages together.
# Node 24 is the Active LTS line (LTS since 2025-10-28, supported to 2028-04-30).
# Keep this on an LTS line: a Current line takes semver-major changes, which a
# routine digest refresh would then carry straight into the production image.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /app

# artillery (devDependency) pulls @playwright/browser-chromium, whose install
# script downloads a browser the image never runs. benchmark/ is not COPYd in.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
# --no-audit only suppresses npm's inline post-install summary; the audit gate is
# a separate job (.github/workflows/security.yaml).
RUN npm ci --no-audit --no-fund
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

# Stage 2: Runtime
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
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
