# syntax=docker/dockerfile:1

FROM node:24-alpine AS basis
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM basis AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS bouw
COPY . .
RUN npm run build

# Next.js-server (standalone uitvoer)
FROM basis AS app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=bouw --chown=node:node /app/.next/standalone ./
COPY --from=bouw --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# Worker, migraties en beheercommando's (tsx + pg_dump)
FROM basis AS worker
ENV NODE_ENV=production TZ=Europe/Amsterdam BACKUP_MAP=/backups
RUN apk add --no-cache postgresql16-client tzdata && mkdir /backups && chown node:node /backups
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
USER node
CMD ["npx", "tsx", "src/worker/index.ts"]
