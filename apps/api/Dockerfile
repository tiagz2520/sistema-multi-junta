FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && chown node:node /app

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/api/package.json apps/api/
COPY --chown=node:node apps/web/package.json apps/web/
COPY --chown=node:node packages/api-client/package.json packages/api-client/
USER node
RUN npm ci --workspace @multi-junta/api --include-workspace-root --no-audit --no-fund

COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node apps/api/ apps/api/
USER root
RUN chown -R node:node apps/api && chmod -R u+rwX apps/api
USER node
RUN npm run build -w @multi-junta/api

EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
