FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY tsconfig.json tsconfig.market-test.json package.json package-lock.json ./
COPY src ./src
RUN npm run build:market-cli

FROM node:22-bookworm-slim AS runtime

ARG V2_M1_COLLECTOR_SOURCE_COMMIT
RUN case "${V2_M1_COLLECTOR_SOURCE_COMMIT}" in \
      [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;; \
      *) echo "V2_M1_COLLECTOR_SOURCE_COMMIT must be a full lowercase commit" >&2; exit 1 ;; \
    esac

LABEL org.opencontainers.image.title="Market Radar V2 M1 Collector" \
      org.opencontainers.image.revision="${V2_M1_COLLECTOR_SOURCE_COMMIT}"

WORKDIR /app
ENV NODE_ENV=production \
    NODE_OPTIONS="--disable-proto=throw --unhandled-rejections=strict"

COPY package.json package-lock.json ./
COPY --from=dependencies /app/node_modules ./node_modules
RUN npm prune --omit=dev && npm cache clean --force
COPY --from=builder /app/.tmp/market-tests/v2 ./.tmp/market-tests/v2

USER node
HEALTHCHECK NONE
ENTRYPOINT ["node", ".tmp/market-tests/v2/entrypoints/m1-collector-worker.js"]
