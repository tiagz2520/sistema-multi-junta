FROM node:24-bookworm-slim

WORKDIR /app
RUN chown node:node /app

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/api/package.json apps/api/
COPY --chown=node:node apps/web/package.json apps/web/
COPY --chown=node:node packages/api-client/package.json packages/api-client/
USER node
RUN npm ci --workspace @multi-junta/web --include-workspace-root --no-audit --no-fund

COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node apps/web/ apps/web/
USER root
RUN chown -R node:node apps/web && chmod -R u+rwX apps/web
USER node

EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "@multi-junta/web"]
