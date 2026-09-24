# Pinned by digest for reproducible, tamper-evident builds; Dependabot's docker
# ecosystem keeps it current. Bump every stage together. The digest is a
# multi-arch index, so the same pin resolves for amd64 and arm64.
#
# Node 24 is the Active LTS line (LTS since 2025-10-28, supported to 2028-04-30).
# main briefly shipped node:25, which is end-of-life (never LTS, ended
# 2026-06-01); #235 carries the same move plus the CI and dependabot changes
# that stop a major bump landing by routine refresh.
#
# Three stages because this image is built for two architectures. A single
# stage meant `npm ci` ran under QEMU for the arm64 leg: 752s against 112s
# native, ~89% of the whole build graph, and it installed the dev tree —
# a Playwright browser download and a node-gyp compile, emulated — only to ship
# it into the runtime image.

# Stage 1: runtime dependencies. TARGET platform, production only.
# --ignore-scripts is safe here: no production dependency has an install
# script. The node-gyp build that used to run belongs to unix-dgram, an
# optional transitive dependency of artillery, which --omit=dev removes.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Stage 2: compile. tsc output is architecture-independent, so this stage is
# pinned to the BUILD platform: it runs natively once and serves every target.
FROM --platform=$BUILDPLATFORM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

# Stage 3: Runtime
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
WORKDIR /app

# tini as PID 1: forwards SIGTERM to node (so graceful shutdown runs) and reaps zombies.
RUN apk add --no-cache tini

# node_modules comes from `deps`, NOT from `build`. The build stage is pinned to
# the build platform, so its node_modules is resolved for the wrong
# architecture — copying it here would put amd64 binaries in the arm64 image.
COPY --from=deps /app/node_modules ./node_modules
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
