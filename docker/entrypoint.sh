#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] prisma migrate deploy..."
  npx prisma migrate deploy
else
  echo "[entrypoint] DATABASE_URL missing — skip migrate"
fi

exec "$@"
