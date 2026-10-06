# CX 13 — Infrastruktur proyek

Konfigurasi Prisma dipindahkan ke `prisma.config.ts`; build fase 2 memuat config
tanpa peringatan package.json#prisma usang. Paket/lock serta Docker/CI disesuaikan
untuk build setelah cleanup dependensi.

Migrasi `0026_review_decision_fk_indexes/migration.sql` menambah indeks FK
Output.reviewerId, DeadlineProposal.decidedById, AccessRequest.decidedById.
Tiga `@@index` schema diselaraskan ke SQL. **Prisma validate lolos** dengan
config termuat/env skip. Seluruh **23 migrasi**, termasuk 0026, berhasil pada
PostgreSQL lokal terisolasi. Tidak diterapkan ke Supabase/server.

Berkas: `prisma.config.ts`, `prisma/schema.prisma`, migrasi 0026,
`package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `Dockerfile`,
`.dockerignore`; pemeriksaan infrastruktur berada di `tests/e2e-lokal/`.

Docker runner final `monitor-karya:cx-final` lolos dengan base Node
22.23.3-bookworm-slim dan 20 dependencies. Tidak mengklaim semua advisori
dependensi lama hilang.

Bukti integrasi bersama dan versi runtime: [hasil CX 8–15](CX8–15-HASIL.md).
Riwayat pemeriksaan: [lampiran lanjutan](LANJUTAN-POIN1-7-DAN-CX8-15.md).

Image migrasi final dikonfirmasi dari `/private/tmp/cx-final-migrate.log`:
config Prisma termuat, **23 migrasi ditemukan, tidak ada migrasi pending**
pada target loopback PostgreSQL lokal 54329. DOCS membaca log; tidak menjalankan
migrasi. Runner final lolos: UID 1000, login 200, pratinjau 404, cron KPI tanpa
rahasia 401. Log `/private/tmp/cx-final-build.log` dan
`/private/tmp/cx-final-runtime.log` dibaca DOCS.

## Audit dependensi akhir

`npm audit --package-lock-only --json` dijalankan parent setelah cleanup dan
menghasilkan exit 1: **9 paket terdampak high, 0 critical**, termasuk rantai
transitif. [Bukti JSON](bukti/npm-audit-final.json). Sumbernya `braces`,
`deepmerge-ts`, dan tiga advisori pada `sharp`. Perbaikan otomatis yang
ditawarkan mencakup downgrade Next/Prisma serta upgrade sharp; tidak diterapkan
dalam CX 13. Gerbang tes/build lolos tidak berarti audit dependensi bersih.
