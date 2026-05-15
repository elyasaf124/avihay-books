#!/bin/sh
set -e
cd /app
echo "[entry] running migrations…"
npm run db:migrate
if [ "${RUN_SEED_ON_START:-false}" = "true" ]; then
  echo "[entry] running seed…"
  npm run db:seed
fi
echo "[entry] starting API…"
cd /app/backend
exec node dist/backend/src/index.js
