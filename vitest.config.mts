import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Tes unit & rute API. Alias @/ mengikuti tsconfig.json ("@/*" -> "./src/*").
 * `server-only` dialihkan ke modul kosong: paket aslinya melempar galat bila
 * diimpor di luar React Server Components, padahal tes berjalan di Node biasa.
 * Tes tidak pernah menyentuh basis data — @/lib/db selalu di-mock.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@/': fileURLToPath(new URL('./src/', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Jam tenggat dibaca dari env saat modul dimuat; pakai nilai bawaan yang
    // terdokumentasi agar tes tidak bergantung pada .env mesin pengembang.
    env: {
      DAILY_CUTOFF_HOUR: '17',
      WEEKLY_HANDOVER_DAY: '4',
      WEEKLY_LOCK_DAY: '5',
      WEEKLY_CUTOFF_HOUR: '17',
      DATABASE_URL: 'postgresql://tes:tes@127.0.0.1:1/tidak-dipakai',
    },
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/app/api/**/*.ts'],
    },
  },
})
