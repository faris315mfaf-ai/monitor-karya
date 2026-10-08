# Laporan T2-B1 — Migrasi 0029: indeks komposit AuditLog

Dikerjakan Zcode (agen T2-B1), 8 Oktober 2026. Zona: `prisma/migrations/0029_auditlog_operational_index/migration.sql`, `prisma/schema.prisma` (satu deklarasi `@@index`), dan laporan ini. Cabang `codex/kerja`, tanpa commit.

## Metode

Saran CX20 (docs/codex/CX20-OPERASIONAL.md): heartbeat operasional memakai `AuditLog` dengan `targetType=OPERATIONAL_JOB` dan `targetId` job tetap, sehingga kueri "run terbaru per job" menyaring tiga kolom sekaligus. Migrasi baru bernomor 0029 (terakhir 0028, 0029 kosong — terverifikasi lewat `ls prisma/migrations`) membuat indeks komposit `("targetType", "targetId", "at")` dengan nama baku Prisma `AuditLog_targetType_targetId_at_idx`, mengikuti pola SQL migrasi 0003/0026 (`CREATE INDEX IF NOT EXISTS`, komentar di atas). Deklarasi `@@index([targetType, targetId, at])` tanpa `map:` ditambahkan di model `AuditLog` — nama baku cocok dengan SQL tanpa pemetaan.

Pengujian memakai kontainer PostgreSQL 17 sekali pakai (`postgres:17-bookworm` sudah tersedia di image lokal, tanpa tarik jaringan) di `127.0.0.1:54361` saja, tanpa volume. DB `drift` (sasaran deploy) dan `shadow` (replay diff) masing-masing diberi metadata tiruan `CREATE SCHEMA storage; CREATE TABLE storage.buckets (...)` yang isinya sama dengan `docker-compose.dev.yml` (migrasi 0006 menyisipkan baris bucket `evidence`). Kontainer dev `monitor-karya-dev-postgres-1` dan port terlarang tidak disentuh; kontainer sekali pakai dihapus (`docker rm -f`) setelah uji selesai.

## Hasil tiap langkah uji

| Langkah | Perintah | Hasil |
|---|---|---|
| Validasi skema | `npx prisma validate` (env dummy) | Lulus — "The schema at prisma/schema.prisma is valid" |
| (1) Deploy pertama | `npx prisma migrate deploy` (DATABASE_URL/DIRECT_URL → 54361/drift) | Sukses — "26 migrations found", semua diterapkan termasuk `0029_auditlog_operational_index`, "All migrations have been successfully applied." |
| (2) Deploy ulang | sama | "No pending migrations to apply." |
| (3) Diff migrasi vs skema | `npx prisma migrate diff --from-migrations prisma/migrations --shadow-database-url <54361/shadow> --to-schema-datamodel prisma/schema.prisma --exit-code` | "No difference detected.", exit 0 |
| (4) Verifikasi indeks | `psql -d drift -c '\di "AuditLog"*'` | Indeks baru ada (dump di bawah) |
| TypeScript | `npx tsc --noEmit --incremental false` (env dummy `postgresql://x:y@127.0.0.1:1/db`) | Lulus, exit 0, tanpa galat |

## Dump \di terkait

```
$ psql -U postgres -d drift -c '\di "AuditLog"*'
                             List of relations
 Schema |                Name                 | Type  |  Owner   |  Table
--------+-------------------------------------+-------+----------+----------
 public | AuditLog_actorId                    | index | postgres | AuditLog
 public | AuditLog_at                         | index | postgres | AuditLog
 public | AuditLog_pkey                       | index | postgres | AuditLog
 public | AuditLog_targetType_targetId_at_idx | index | postgres | AuditLog
(4 rows)
```

Definisi dari `pg_indexes`:

```
CREATE INDEX "AuditLog_targetType_targetId_at_idx" ON public."AuditLog" USING btree ("targetType", "targetId", at)
```

## Berkas berubah

- `prisma/migrations/0029_auditlog_operational_index/migration.sql` — baru; satu `CREATE INDEX IF NOT EXISTS` komposit.
- `prisma/schema.prisma` — satu baris `@@index([targetType, targetId, at])` pada model `AuditLog` (tanpa `map:`).
- `docs/zcode/laporan-swarm/T2-B1-LAPORAN.md` — laporan ini.

## Keterbatasan

- Teruji "lulus DB lokal sekali pakai", bukan terverifikasi produksi. DB produksi tetap wajib menjalankan urutan migrasi tertunda oleh operator; 0029 hanya additive (`CREATE INDEX IF NOT EXISTS`, tanpa mengubah baris/tabel).
- Indeks baru tidak diukur peningkatan kinerjanya (tidak ada data volume besar di fixture); dasarnya rekomendasi CX20 untuk volume AuditLog besar. `CREATE INDEX` non-`CONCURRENTLY` mengunci penulisan sesaat saat migrasi dijalankan — penjadwalan saat jendela tenang tetap urusan operator.
- `prisma generate` tidak dijalankan ulang; `@@index` tidak mengubah API klien Prisma dan `tsc` lulus dengan klien yang ada.
- Vitest/ESLint/build tidak dijalankan (di luar lingkup tugas; tidak ada perubahan kode aplikasi).
- Tanpa commit; penggabungan oleh koordinator swarm.
