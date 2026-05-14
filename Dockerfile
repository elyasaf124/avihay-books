# Monorepo: `shared` + `backend`; `mobile/package.json` נדרש ל־`npm ci` (לא מעתיקים את קוד ה־`Expo`).
FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY mobile/package.json mobile/

COPY shared/ shared/

RUN npm ci -w backend -w shared --include-workspace-root

COPY backend/ backend/
COPY database/ database/
COPY seed/ seed/

RUN npm run shared:build && npm run backend:build

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
EXPOSE 4000

ENTRYPOINT ["/entrypoint.sh"]
