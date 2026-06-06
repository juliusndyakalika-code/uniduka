#!/bin/sh
# Merge stderr into stdout so all errors appear in Railway deployment logs
exec 2>&1
./node_modules/.bin/prisma migrate deploy
exec node dist/app.js
