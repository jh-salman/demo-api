# demo-api — production image (Hostinger VPS / Docker)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate \
  && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r salonx \
  && useradd -r -g salonx salonx

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev \
  && npm install prisma@6.19.0 --no-save \
  && npx prisma generate \
  && mkdir -p /app/public/uploads /app/data \
  && chown -R salonx:salonx /app

COPY --from=build /app/dist ./dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER salonx
EXPOSE 4000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/server.js"]
