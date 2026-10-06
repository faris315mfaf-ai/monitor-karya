# Koordinasi Claude Code ↔ Codex

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
(termasuk perubahan yang belum di-commit) pada saat worktree dibuat.

## Aturan bersama (wajib)

1. **Basis data dilarang.** Jangan jalankan `prisma migrate`, `prisma db push`,
   `prisma db execute`, `db:seed`, atau skrip apa pun ke `DATABASE_URL`. Supabase
   dipakai sungguhan, dan migrasi 0013–0025 belum diterapkan.
2. **Migrasi baru hanya oleh Claude.** Codex tidak membuat folder di
   `prisma/migrations/`. Bila butuh kolom/tabel, tulis usulannya di
   `docs/usulan-skema/<nama>.md`; Claude yang menomori dan menulis SQL-nya,
   supaya urutan migrasi tidak bertabrakan.
3. **Jangan rebase, reset, atau force-push** cabang mana pun. Penggabungan
   dilakukan oleh manusia (atau Claude atas permintaan manusia).
4. **Commit kecil dan sering** di cabang sendiri, pesan dalam bahasa Indonesia,
   satu topik per commit. Itu yang membuat penggabungan mudah.
5. **Ambil zona, tulis di sini.** Sebelum mengerjakan sesuatu, tambahkan baris di
   tabel "Zona aktif" di bawah. Jangan mengerjakan berkas yang sedang diklaim
   pihak lain.
6. **Desain & bahasa:** ikuti `AGENTS.md` (token, komponen `src/components/mk`,
   bahasa Indonesia, sapaan "Anda").
7. **Pemeriksaan sebelum commit:** `npx tsc --noEmit`, `npx eslint src`,
   `npx vitest run`.

## Zona aktif

| Pihak | Zona (folder/berkas) | Sejak | Status |
|---|---|---|---|
| Claude (workflow 4 fase) | `src/components/oversight/*`, `src/app/api/ringkasan/**`, `src/components/views/dash-common.tsx`, `src/components/search/*`, `src/app/api/nav-badges/**` (F2 Direktur & Manajemen) | 6 Okt 2026 | berjalan |
| Claude (workflow 4 fase) | `src/components/preview/**`, `tests/**`, `vitest.config.*` (F3) | 6 Okt 2026 | menunggu |
| Claude (workflow 4 fase) | semua layar UI untuk audit mutu, `docs/fitur/**`, `docs/SISA-PEKERJAAN.md` (F4) | 6 Okt 2026 | menunggu |

Selama workflow Claude berjalan, zona yang **aman untuk Codex**:

- `deploy/**`, `Dockerfile`, `.dockerignore` — paket deploy VPS.
- `scripts/**` kecuali `scripts/seed.ts` — alat bantu.
- `src/lib/evidence-access.ts` — buka kunci belum berefek pada unggah/hapus bukti (lihat SISA-PEKERJAAN).
- `src/components/weekly-task-board.tsx` — memakai `frozenDays` dari `GET /api/tasks?week=`.
- `docs/usulan-skema/**`, `docs/codex/**` — catatan dan usulan Codex.

Berkas lain: tunggu workflow selesai (baris di atas berubah ke "selesai").

## Menggabungkan pekerjaan Codex

Dilakukan manusia setelah workflow Claude selesai dan pekerjaan Claude sudah di-commit:

```bash
cd "~/PROYEK/monitor karya"
git merge --no-ff codex/kerja
npx prisma generate && npx tsc --noEmit && npx vitest run
```

Konflik di berkas yang diklaim Claude: utamakan versi Claude, lalu terapkan ulang
perubahan Codex di atasnya.
