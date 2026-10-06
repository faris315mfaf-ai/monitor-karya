# CX 3 — CI GitHub Actions

Workflow `.github/workflows/ci.yml` menjalankan npm ci, Prisma Client, TypeScript, ESLint, Vitest, build Next.js, dan image Docker runner pada push dan pull request. Izin hanya contents:read; konkurensi membatalkan run lama; timeout 25 menit. URL DB tiruan memakai port mati 1; AUTH_SECRET acak dibuat per job. Tidak memakai rahasia Supabase.

Eksekusi di GitHub baru dapat dibuktikan setelah perubahan di-push. Verifikasi lokal dan Docker dicatat di laporan integrasi.
