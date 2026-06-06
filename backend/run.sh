#!/bin/sh
# merge stderr into stdout so Railway captures all output
exec 2>&1

echo "[RUN] node $(node --version)"
echo "[RUN] PORT=$PORT NODE_ENV=$NODE_ENV"
echo "[RUN] DB=$([ -n "$DATABASE_URL" ] && echo SET || echo MISSING)"

echo "[RUN] running prisma migrate deploy..."
./node_modules/.bin/prisma migrate deploy
echo "[RUN] migration done, starting node..."
exec node start.js
