FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Run as a non-root user rather than the container default (root).
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma

# Writable at runtime: uploaded files (local-storage fallback) and JSON backup
# snapshots (pg_dump fallback in BackupService).
RUN mkdir -p ./public/uploads ./backups && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["npm", "run", "start"]

