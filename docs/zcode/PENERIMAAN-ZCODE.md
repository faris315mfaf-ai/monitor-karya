# Penerimaan Zcode — hasil pemeriksaan aktual

Diperiksa 8 Oktober 2026, 09.50 WIB, oleh Zcode selama sesi penerimaan. Laporan ini hanya memuat pemeriksaan yang benar-benar dijalankan pada sesi ini. Angka tes aplikasi dan HTTP di bagian bukti adalah artefak historis 7 Oktober yang dibaca, bukan dijalankan ulang.

## Posisi kode

| Item | Hasil aktual |
|---|---|
| Folder | `/Users/godam/PROYEK/monitor-karya-codex` |
| Cabang | `codex/kerja` |
| HEAD | `1aa4b8d` (8 Okt 2026 09.18 +0700, "DOCS: siapkan paket serah terima lengkap untuk Zcode") |
| Perubahan belum commit | Tidak ada; working tree bersih |
| Worktree lain | `/Users/godam/PROYEK/monitor karya` pada `89766df` `[desain-baru]` — tidak disentuh, tidak ditimpa |
| Basis implementasi | `4117a25` (7 Okt 16.38 +0700) berada tepat di bawah commit dokumentasi, sesuai catatan paket |

## Layanan yang diperiksa

| Layanan | Kondisi saat diperiksa | Tindakan |
|---|---|---|
| localhost:3200 (dev pengguna) | **Tidak hidup**; tidak ada proses mendengarkan | Tidak dinyalakan; menunggu arahan tugas pertama |
| localhost:3100 (alokasi Claude) | Tidak hidup | Tidak disentuh |
| 127.0.0.1:54339 (PostgreSQL pengguna) | Hidup: kontainer Docker `monitor-karya-dev-postgres-1`, up 43 jam, healthy | Hanya dilihat lewat `docker ps`; tanpa query, tanpa reset, tanpa seed |
| 3211 / 54349 (fixture CX16) | Tidak diperiksa; memang bukan layanan pengguna | Tidak disentuh |

Versi alat: Node v22.23.3 (cocok CI). npm bawaan shell 10.9.9; dokumen lingkungan menyebut npm 11.19.1 untuk setup/build yang diperiksa sebelumnya — bila tugas berikutnya memerlukan instalasi ulang, pastikan dulu versi npm yang tersedia. `node_modules` sudah terpasang, Next 16.3.8, panduan lokal `node_modules/next/dist/docs/` ada.

## Dokumen yang dibaca

AGENTS.md, ZCODE.md, docs/SERAH-TERIMA-ZCODE.md, seluruh paket docs/zcode (README, 01–11), docs/SISA-PEKERJAAN.md, docs/KOORDINASI-AGEN.md, DESIGN.md (pintu masuk), daftar docs/design/peran/ (00–08). Dibaca pula pada sesi ini: docs/codex/CX19-DEPENDENSI.md, docs/codex/CX16-20-HASIL.md (bagian audit), docs/codex/bukti/*.

## Pencocokan inventaris dan kode

Cocok antara dokumentasi dan kode aktual:

- 74 berkas route API di `src/app/api` — sama dengan inventaris dokumen 10.
- 45 model Prisma pada `schema.prisma` — sama.
- 25 folder migrasi, terakhir `0028_account_activation`; 0020/0022/0024 memang tidak ada (sengaja kosong). Nomor berikutnya 0029 setelah diperiksa ulang saat dibutuhkan.
- `vendor/braces` lengkap: README, tarball `braces-3.0.3-mk.1.tgz`, `depth-guard.patch`, `package/`, `provenance.json`, `test/`, `upstream/`, `verify.py`.
- `src/lib/rbac.ts`: 9 peran, `ROLE_CAPABILITIES`, `ROLE_TABS`, rantai persetujuan proyek, meja akun (Admin PT terbatas pada `ADMIN_PT/KEPALA_DIVISI/PIC_PROYEK`), `MASTER_ROLES` TI/SUPERADMIN. Kode mengonfirmasi tiga keputusan yang masih terbuka di backlog: KEPALA_DIVISI tanpa `unlock:request`; DIREKTUR_SDM_GA tanpa tab persetujuan; DIREKTUR_ENTITAS punya `audit:read` tetapi belum punya tab audit.
- `src/lib/auth.ts`: token HMAC dengan `sid` acak dan sidik kata sandi `pv`, masa 8 jam; sesi diverifikasi ke `AuthSession` (`revokedAt`/kedaluwarsa) dan dibaca ulang tiap permintaan; token lama tanpa `sid`/`pv` ditolak; `mustChangePassword` menolak 403 di semua rute kecuali ganti kata sandi; cakupan entitas via `resolveScopeEntityId`/`scopeEntityIds`/`scopeUserIds` dan `refuseUnscoped` untuk akun tak bertaut.
- `src/lib/account-activation.ts`: token acak 32 byte (base64url 43 karakter), hanya `tokenHash` + `credentialDigest` disimpan, TTL 24 jam, terbitan ulang mengganti tautan lama (upsert), konsumsi atomik berlapis (`updateMany` `count === 1` pada tautan dan pada pengguna), tanpa login otomatis, pembatas laju, audit tanpa token.
- Alur harian: `daily-rollup.ts` memuat `computeRollup`, `dailyGate`, pesan beku terusan/terkunci, `syncEvidenceCount`; `dailyGate` dipakai `api/daily-input`, `api/tasks`, `evidence-access.ts`. `daily-input-view.tsx` menampilkan kartu "Proyek Anda hari ini" untuk PIC multi-proyek dan membuka tiap proyek di Sheet. Route `api/daily-input` memakai `requireApiUser` + `can('daily:input')` di GET/PUT/DELETE.
- Batas akses objek: `pic-access.ts` (`guardProjectAccess`, `projectScopeWhere`, `relationTo`) sesuai deskripsi dokumen 03/04.
- `src/lib/lock.ts`: hari mulai WIB, `dailyLockAt`, `weeklyDeadlines` (serah Kamis, kunci Jumat) sesuai dokumen.

Bukti historis yang dibaca (artefak, bukan pengujian baru):

- `docs/codex/bukti/CX16-20-vitest.txt`: 69 berkas / 1.356 tes lulus (7 Okt).
- `docs/codex/bukti/CX16-20-http-local.json`: 7 skenario PASS bertanda 2026-10-07, `productionStorage: "NOT_TESTED"` — konsisten dengan A2-08 yang masih terbuka.
- `docs/codex/bukti/final-gate.txt`: gerbang 6 Oktober (1.192 tes, 23 migrasi saat itu, audit npm masih 9 high). Kronologis konsisten dengan CX19 7 Oktober: 9 high → 5 setelah upgrade resmi → 0 setelah patch lokal (`CX19-AUDIT.json`, `production` 0). Tidak ada kontradiksi antara "audit 9" di artefak 6 Okt dan klaim "audit 0" di laporan 7 Okt.
- `docs/codex/bukti/CX20-probe-local.json` ada dan berisi hasil probe.

Pemeriksaan segar yang benar-benar dijalankan pada sesi ini (tanpa menyentuh DB dan layanan):

- `python3 vendor/braces/verify.py` → PASS (integritas pristine, hash tes upstream, patch sumber, tarball byte-for-byte).
- `npm run test:dependencies` → **794/794 lulus, 0 gagal**; angka ini kini punya konfirmasi baru 8 Oktober, bukan hanya historis.

## Ketidaksesuaian yang ditemukan

1. Indeks `docs/zcode/11-INDEKS-DOKUMEN.md` menyebut 111 dokumen Markdown; hitungan aktual `git ls-files "*.md"` adalah **112**. Selisihnya: `docs/codex/CX8–15-HASIL.md` (nama berkas memakai en dash) tidak tercantum pada daftar indeks, padahal dirujuk SISA-PEKERJAAN. Dampak dokumentatif saja; berkasnya ada.
2. Tidak ada ketidaksesuaian lain antara klaim paket dan hasil pemeriksaan kode/lingkungan pada cakupan yang diperiksa.

## Keterbatasan alat dan pemeriksaan

- Skill codebase-memory tersedia sebagai panduan, tetapi 15 tool MCP grafnya tidak terpasang pada sesi ini; penelusuran dilakukan langsung pada sumber. Klaim struktural di atas terbatas pada berkas yang benar-benar dibaca/dipetakan, bukan graf panggilan lengkap.
- Gerbang penuh (`tsc`, `eslint src`, `vitest run`, `next build`, uji HTTP fixture) tidak dijalankan pada penerimaan ini; akan dijalankan pada tugas kode pertama sesuai daftar dokumen 06.
- Isi database 54339 tidak dibaca sama sekali (hanya status kontainer); angka 97 akun/40 proyek/741 laporan tetap klaim snapshot pemilik.
- Produksi, Supabase, dan pengunggahan Storage nyata (A2-08) tidak dan tidak boleh diperiksa dari sesi ini.

## Status ringkas

- Selesai (lokal, terdokumentasi): CX 1–20 termasuk akses sementara, sesi/cabut token, aktivasi sekali pakai, patch dependensi, health/cron/backup; 1.356 tes aplikasi dan 794 tes dependensi (yang terakhir dikonfirmasi ulang hari ini).
- Belum selesai: produksi (migrasi tertunda 0013–0028, backfill `divisionId`, env/cron/monitor VPS), A2-08 unggah Storage nyata, drift migrasi 0001–0012, rate limit multi-instans, label 3 huruf heatmap Admin, ActivityItem Auditor, QA perangkat asli, dan 13 keputusan pemilik pada bagian B backlog.
- Memerlukan keputusan pemilik: seluruh butir bagian B di SISA-PEKERJAAN (antara lain kepatuhan per orang, bobot KPI, ambang beban, navigasi per spesifikasi, perubahan peran oleh Admin PT, buka kunci oleh kepala divisi, tab Direksi SDM & GA dan Direktur entitas, jenis Kontrak, istilah UI, ubin Template, tiga grafik/API belum dipasang).
- Memerlukan operator produksi: seluruh bagian A (cadangan, `migrate status`, migrasi tertunda berurutan, audit hibah PIC historis, backfill, setup env/CSP/storage/cron, komunikasi login ulang).

## Rencana tugas berikutnya

Menunggu penetapan tugas dari pemilik. Usulan urutan ada pada laporan percakapan penerimaan; setiap tugas akan dimulai dengan klaim zona, perubahan kecil, tes terfokus, gerbang dari dokumen 06, dan catatan `docs/zcode/HASIL-<topik>.md`.
