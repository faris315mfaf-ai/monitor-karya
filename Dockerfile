# Monitor Karya — image produksi untuk VPS (Next.js standalone + Prisma).
# Bangun di VPS aplikasi:  docker compose build   (lihat deploy/app-vps/)
#
# Tahap:
#   deps     — node_modules lengkap (dipakai build & migrasi)
#   build    — prisma generate + next build (output: standalone)
#   migrate  — image kecil berisi Prisma CLI untuk `prisma migrate deploy`
#   runner   — image akhir: hanya server standalone, user non-root

ARG NODE_VERSION=22.23.3-bookworm-slim

FROM node:${NODE_VERSION} AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# npm 11.19 membaca package.json#allowScripts; npm bawaan Node 22 belum tentu.
RUN npm install --global npm@11.19.1 --ignore-scripts --no-audit --no-fund
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY vendor ./vendor
COPY prisma ./prisma
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:1/build \
    DIRECT_URL=postgresql://build:build@127.0.0.1:1/build \
    npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
# Variabel NEXT_PUBLIC_* dibakukan ke bundel saat build.
ARG NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
# Build tidak boleh menerima URL atau rahasia basis data produksi.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:1/build \
    DIRECT_URL=postgresql://build:build@127.0.0.1:1/build \
    AUTH_SECRET=build-only-placeholder-secret-at-least-32-characters \
    npx prisma generate \
 && DATABASE_URL=postgresql://build:build@127.0.0.1:1/build \
    DIRECT_URL=postgresql://build:build@127.0.0.1:1/build \
    AUTH_SECRET=build-only-placeholder-secret-at-least-32-characters \
    npx next build

FROM base AS migrate
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
