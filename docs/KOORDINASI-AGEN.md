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
