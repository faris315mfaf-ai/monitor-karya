# E2E-SERVER-N01 — Simpan pertama Aturan pelaporan tidak lagi mengubah medan lain

Tanggal: 13 Oktober 2026 · Cabang: `claude/perbaiki-bug-sisa` · Sumber temuan: `android/docs/fase3/E2E-R2-2-ADMIN-DIREKTUR.md` N-01

## Akar masalah

`PUT /api/admin/report-settings` memakai `upsert` dengan `create: { entityId, ...data }`, dan `data` hanya berisi medan yang dikirim.
Bila entitas belum punya baris `ReportSettings`, medan lain jatuh ke bawaan kolom schema:

- `workingDays @default([])` berarti setiap hari
- `dailyCutoffHour` / `weeklyCutoffHour` null berarti tanpa batas

Padahal aturan efektif yang dibaca semua gerbang (`getReportSettings` → `DEFAULT_SETTINGS`) adalah 17.00, Senin–Jumat, dan mingguan 17.00.
Akibatnya satu ketukan chip diam-diam mengubah hari kerja dan tenggat mingguan PT.

## Perbaikan

`src/app/api/admin/report-settings/route.ts`:

- `create` menjadi `{ entityId, ...DEFAULT_SETTINGS, workingDays: [...DEFAULT_SETTINGS.workingDays], ...data }`. Untuk baris baru, medan yang tidak dikirim mengikuti aturan efektif saat ini. Larik disalin supaya konstanta bawaan tidak ikut termutasi.
- `update` tidak berubah: tetap hanya berisi medan yang dikirim. Untuk baris yang sudah ada, medan lain tidak disentuh.
- Nilai null atau kosong yang dikirim secara eksplisit (24/7, setiap hari) tetap dihormati.
- Audit `UPDATE_REPORT_SETTINGS` tidak berubah. Pada simpan pertama, `beforeData` = null (memang belum ada baris), dan `afterData` berisi aturan lengkap hasil penggabungan.

## Pemeriksaan jalur lain

| Jalur | Hasil |
|---|---|
| Web `src/components/admin/report-settings-card.tsx` | Mengirim **parsial** (satu medan per klik). Tanpa baris, kartu menampilkan `BAWAAN_SERVER`, yang sama dengan `DEFAULT_SETTINGS`. Web terdampak bug yang sama dan kini beres lewat perbaikan server. Kartu tidak perlu diubah. |
| Android `AturanPelaporanLogika.kt` | Juga mengirim satu medan, menurut laporan E2E. Beres lewat server dan tidak disentuh. |
| `prisma/seed.sql`, `scripts/`, `deploy/` | Tidak ada yang menulis `ReportSettings`. |
| Migrasi `0030_report_settings` | Hanya DDL, tanpa INSERT bawaan. |
| Penulis lain di `src/` | Tidak ada. Route ini satu-satunya `upsert`/`create`. |
| `GET` | Tetap mengembalikan `settings: null` bila belum ada baris. Klien memakai null untuk teks "belum pernah mengatur". |

## Tes

Di `tests/api/report-settings-audit.test.ts` ditambahkan 8 tes. Upsert tiruan meniru Prisma: `create` jatuh ke bawaan schema, `update` digabung ke baris.

- Entitas tanpa baris, PUT `{dailyCutoffHour: 15}`: hari kerja tetap Sen–Jum, mingguan tetap 17, dan `update` hanya berisi `{dailyCutoffHour: 15}`.
- Entitas tanpa baris, "Tutup pengisian": jam harian tetap 17 (tidak berubah menjadi 24/7).
- Entitas tanpa baris, null/[] dikirim eksplisit: nilai itu dihormati.
- `DEFAULT_SETTINGS` tidak termutasi.
- Entitas dengan baris (24/7, setiap hari), PUT `{weeklyOpen: false}`: medan lain tetap.
- Entitas dengan baris, ubah hari kerja: jam harian dan mingguan tetap.
- Audit simpan pertama: `beforeData` null, `afterData` berisi aturan lengkap.
- Audit baris yang ada: sebelum dan sesudah hanya berbeda pada medan yang dikirim.

## Gerbang

- `npx tsc --noEmit --incremental false`: bersih
- `npx eslint src`: bersih
- `npx vitest run`: 105 berkas / 1.760 tes lulus

Tidak ada commit, DB, atau server dev yang disentuh. `android/` dan `prisma/migrations` juga tidak disentuh.

## Catatan

Baris data yang sudah telanjur rusak oleh bug ini (PT yang pernah disimpan pertama kali sebelum perbaikan) tidak dipulihkan otomatis. Menurut laporan E2E, PT-001 di lokal sudah dipulihkan manual. Di produksi, baris 24/7 memang disengaja.
