import { defineConfig, env } from 'prisma/config'

// Prisma 6.19: konfigurasi ini menonaktifkan pemuatan .env implisit CLI.
// Kedua URL WAJIB diberikan pemanggil. Tidak ada fallback ke DB pengembang
// atau produksi. Build/CI memakai URL loopback port 1 yang tidak terhubung.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx scripts/seed.ts' },
  engine: 'classic',
  datasource: { url: env('DATABASE_URL'), directUrl: env('DIRECT_URL') },
})
