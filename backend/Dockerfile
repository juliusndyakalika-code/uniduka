FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Runtime image ────────────────────────────────────────────────────────────
FROM node:20-slim

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

# Copy Prisma client and CLI from builder (CLI is devDep — not installed with --omit=dev)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

COPY prisma ./prisma
COPY seed-prod.js ./
COPY run.sh ./
COPY public ./public
COPY --from=builder /app/dist ./dist

EXPOSE 4000

CMD ["sh", "run.sh"]
