# syntax=docker/dockerfile:1
# EC2-only build path; the five original ECS Dockerfiles remain unchanged.
FROM node:24-bookworm-slim

ARG SERVICE_PATH
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
# Optional public CA supplied only when a build environment uses a TLS proxy.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund

COPY --chown=node:node ${SERVICE_PATH}/package.json ${SERVICE_PATH}/package-lock.json ./${SERVICE_PATH}/
WORKDIR /app/${SERVICE_PATH}
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund

COPY --chown=node:node ${SERVICE_PATH}/ ./
COPY --chown=node:node shared/ /app/shared/
RUN mkdir -p temp && chown node:node temp
ENV NODE_ENV=production
USER node
# Same executable as each existing npm start script, with direct signal delivery.
CMD ["node", "index.js"]
