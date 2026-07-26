FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS builder

ARG V2_M1_COLLECTOR_SOURCE_COMMIT
RUN case "${V2_M1_COLLECTOR_SOURCE_COMMIT}" in \
      [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;; \
      *) echo "V2_M1_COLLECTOR_SOURCE_COMMIT must be a full lowercase commit" >&2; exit 1 ;; \
    esac

WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY tsconfig.json tsconfig.market-test.json package.json package-lock.json ./
COPY src ./src
RUN npm run build:market-cli

FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS production-dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM gcr.io/distroless/nodejs22-debian13@sha256:6eae66c49774276f50ae1818db25bb89735971a909fb833633dd1400dbc450a1 AS runtime

ARG V2_M1_COLLECTOR_SOURCE_COMMIT

LABEL org.opencontainers.image.title="Market Radar V2 M1 Collector" \
      org.opencontainers.image.revision="${V2_M1_COLLECTOR_SOURCE_COMMIT}"

WORKDIR /app
ENV NODE_ENV=production \
    NODE_OPTIONS="--disable-proto=throw --unhandled-rejections=strict"

COPY --chown=65532:65532 package.json ./
COPY --chown=65532:65532 --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=65532:65532 --from=builder /app/.tmp/market-tests/v2 ./.tmp/market-tests/v2

USER 65532:65532
HEALTHCHECK NONE
ENTRYPOINT ["/nodejs/bin/node", ".tmp/market-tests/v2/entrypoints/m1-collector-worker.js"]
