# Koordinasi Claude Code ↔ Codex

> Sejak 6 Okt 2026 Codex menjadi pemegang utama — lihat [`SERAH-TERIMA-CODEX.md`](SERAH-TERIMA-CODEX.md). Aturan migrasi di bawah digantikan bagian 5 dokumen itu: Codex boleh menulis migrasi mulai 0026, tetap tidak pernah ke Supabase.

Dua agen AI bekerja di proyek ini bersamaan. Aturan ini mencegah keduanya
saling menimpa. Berlaku untuk Claude Code, Codex, dan manusia.

## Tata letak

| Folder | Cabang | Dipakai oleh | Dev server |
|---|---|---|---|
| `~/PROYEK/monitor karya` | `desain-baru` | Claude Code (termasuk workflow multi-agen) | http://localhost:3100 |
| `~/PROYEK/monitor-karya-codex` | `codex/kerja` | Codex | http://localhost:3200 |

Keduanya **git worktree** dari repo yang sama: berkas terpisah, riwayat git sama.
Codex tidak pernah mengedit folder Claude, dan sebaliknya.

`codex/kerja` dimulai dari cabang `codex/basis`, yaitu potret pohon kerja Claude
(termasuk perubahan yang belum di-commit). Potret diperbarui dengan
`scripts/sinkron-codex.sh`, lalu Codex menjalankan `git merge --no-edit codex/basis`.

## Aturan bersama (wajib)

1. **Basis data sungguhan dilarang.** Jangan jalankan `prisma migrate`, `prisma db push`,
   `prisma db execute`, `db:seed`, atau skrip apa pun ke Supabase atau basis data
   server. Supabase dipakai sungguhan, dan migrasi 0013–0025 belum diterapkan.
   **Pengecualian:** basis data lokal Docker dari TUGAS CX 4 (`127.0.0.1:54329`)
   boleh dimigrasi dan di-seed.
2. **Migrasi baru hanya oleh Claude.** Codex tidak membuat folder di
   `prisma/migrations/`. Bila butuh kolom/tabel, tulis usulannya di
   `docs/usulan-skema/<nama>.md`; Claude yang menomori dan menulis SQL-nya,
   supaya urutan migrasi tidak bertabrakan.
3. **Jangan rebase, reset, atau force-push** cabang mana pun. Penggabungan
   dilakukan oleh manusia (atau Claude atas permintaan manusia).
4. **Commit kecil dan sering** di cabang sendiri, pesan dalam bahasa Indonesia,
   satu topik per commit. Itu yang membuat penggabungan mudah.
5. **Kerjakan per kode tugas.** Daftar tugas, zona berkas, dan kriteria selesai ada
   di [`PEMBAGIAN-TUGAS.md`](PEMBAGIAN-TUGAS.md) (TUGAS CD n untuk Claude, TUGAS CX n
   untuk Codex). Edit hanya zona tugas Anda; butuh berkas lain → tulis di
   "Permintaan lintas zona". Awali pesan commit dengan kodenya, mis. `CX 2: …`.
6. **Desain & bahasa:** ikuti `AGENTS.md` (token, komponen `src/components/mk`,
   bahasa Indonesia, sapaan "Anda").
7. **Pemeriksaan sebelum commit:** `npx tsc --noEmit`, `npx eslint src`,
   `npx vitest run`.

## Koordinasi lanjutan Codex — 6 Oktober 2026

Status: **gerbang lokal final lolos; commit/integrasi oleh parent**, basis awal `codex/kerja` pada `89766df`.
Instruksi pemilik untuk putaran ini: kerja langsung di worktree Codex, zona
terpisah, tanpa commit; parent menangani gerbang pemeriksaan dan integrasi.
Jangan membatalkan edit agen lain. Permintaan lintas zona melalui parent.

| Pemilik zona | Zona | Tanggung jawab putaran ini |
|---|---|---|
| Agen dokumentasi (DOCS) | `docs/**`, `README.md`, `DESIGN.md` | Rencana, catatan bukti, laporan hasil dan pembaruan dokumen usang; tidak mengubah kode produksi |
| Parent | Pembagian zona implementasi dan gerbang integrasi | Mengalokasikan 5 agen fase poin 1–7, kemudian 5 agen CX 8–15; mengirim bukti dan tangkapan layar ke DOCS |
| Agen implementasi | Zona kode disjoint yang ditetapkan parent | Melaporkan berkas berubah, regresi sebelum/sesudah perbaikan, tes terfokus, dan batasan; perubahan lintas zona lewat parent |

Klaim DOCS aktif sebelum edit dokumentasi putaran ini. Pemetaan fase 1 dari parent: Carson (hak akses/Urungkan), Boole (atomik),
Archimedes (PIC), Kant (guard skrip), dan Banach (Auditor/harness galat mentah).
Rincian subzona dan status bukti dicatat pada rencana lanjutan; perubahan lintas
zona tetap melalui parent. Tabel zona historis di bawah tidak menjadi pembagian baru. Aturan migrasi terbaru mengikuti bagian 5
[`SERAH-TERIMA-CODEX.md`](SERAH-TERIMA-CODEX.md), menggantikan larangan lama
Codex menulis migrasi. Untuk putaran ini, jangan seed/reset basis data persisten
lokal port 54339 atau menghentikan server port 3200. Tidak ada operasi Supabase,
server, push, PR, rebase, reset, atau force-push.

Gerbang final lokal: 63 berkas/1.192 tes, Prisma validate, TypeScript, ESLint,
diff check, build/runtime runner Docker lolos. HTTP/PostgreSQL lokal 14
pemeriksaan serta tiga race lolos. Hasil final ada di laporan CX 8–15.
Fase 2: 5 agen baru untuk CX 8 sisa; CX 9+15 dan subjudul Auditor; CX 10+12;
CX 11 pratinjau; CX 13+14 infrastruktur/e2e. DOCS tetap pemilik dokumentasi.

Rencana dan status bukti: [lanjutan poin 1–7 dan CX 8–15](codex/LANJUTAN-POIN1-7-DAN-CX8-15.md).

## Zona aktif

Zona per tugas ada di `PEMBAGIAN-TUGAS.md`. Ringkasnya:

| Pihak | Zona | Tugas |
|---|---|---|
| Claude (workflow) | `src/components/preview/**`, `tests/api/**`, `vitest.config.*` | CD 1, CD 2 |
| Claude (workflow) | semua layar UI & CSS (kecuali zona CX 2), `docs/fitur/**`, `docs/SISA-PEKERJAAN.md` | CD 3–5 |
| Codex | `src/lib/evidence-access.ts`, `tests/cx/**` | CX 1 |
| Codex | `src/components/weekly-task-board.tsx`, `src/app/css/weekly-task.css` | CX 2 |
| Codex | `.github/**` | CX 3 |
| Codex | `docker-compose.dev.yml`, `scripts/db-lokal.sh`, `.env.lokal.example`, `docs/codex/**` | CX 4 |
| Codex | `scripts/seed.ts` | CX 5 |
| Codex | `deploy/**`, `Dockerfile`, `.dockerignore` | CX 6 |

## Menggabungkan pekerjaan Codex

Dilakukan manusia setelah workflow Claude selesai dan pekerjaan Claude sudah di-commit:

```bash
cd "~/PROYEK/monitor karya"
git merge --no-ff codex/kerja
npx prisma generate && npx tsc --noEmit && npx vitest run
```

Konflik di berkas yang diklaim Claude: utamakan versi Claude, lalu terapkan ulang
perubahan Codex di atasnya.

## Putaran 7 Oktober 2026 — lima prioritas lanjutan

Diotorisasi pemilik: kerjakan seluruh poin 1–5 hasil pemeriksaan. Worktree Codex saja.
- Parent: kedaluwarsa akses, sesi server, auth/login/logout/password, schema sesi/migrasi 0027, integrasi dan laporan.
- Agen aktivasi: alur aktivasi akun (lib/account-activation, API auth/activate dan companies activation, halaman aktivasi, UI akun), migrasi 0028; usulan schema ke parent.
- Agen dependensi: package.json/package-lock.json dan bukti audit dependensi.
- Agen operasional: readiness/health, status cron/backup/storage, deploy scripts, tes terkait, migrasi 0029 bila perlu; usulan schema ke parent.
Tidak menyentuh DB server/Supabase. DB persisten 54339 tidak direset/seed. Tidak push/PR/deploy.

Penutupan parent: 69 berkas/1.356 tes aplikasi, 794 tes dependensi Node22/Linux,
TypeScript, ESLint src, diff check, build Next/Docker lulus. Tujuh skenario
HTTP/PostgreSQL image final dan tiga probe gangguan lokal lulus. DB persisten
dicadangkan lalu menerima migrasi tambahan 0026–0028; 97/40/741 akun/proyek/laporan
tetap ada. Server3200 berjalan. Zona implementasi agen dilepas; parent menyimpan
commit dan dokumentasi. [Laporan](codex/CX16-20-HASIL.md).

## Klaim CX18 — aktivasi akun (7 Oktober 2026)

Agen aktivasi memiliki `src/lib/account-activation.ts`, API `auth/activate` dan
`companies/users/activation`, `login/aktivasi`, integrasi `api/access-requests/route.ts`,
UI `admin/access-requests-card.tsx`, `companies/account-sheet.tsx` dan komponen aktivasi baru,
`tests/cx/activation.test.ts`, `docs/codex/CX18-AKTIVASI.md`. Schema/migrasi dan auth/sesi tetap parent.
Kontrak model untuk parent ada di laporan CX18; tool pesan ke native ancestor tidak tersedia.

### Perbaikan P1 PIC sementara — 7 Oktober 2026
Parent menyerahkan `src/lib/access-requests.ts` kepada agen aktivasi untuk snapshot/pemulihan PIC sementara dan `tests/cx/temporary-pic.test.ts`; mock access-revert bila perlu. Kunci User, penjagaan hibah bertumpuk, dan klaim expiry atomik dipertahankan. Parent menangani atomisitas kata sandi/sesi (P2). Tanpa commit.
