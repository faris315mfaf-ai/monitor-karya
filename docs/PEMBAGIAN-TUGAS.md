# Pembagian tugas Claude Code (CD) & Codex (CX)

Tugas dibagi supaya keduanya bisa jalan **bersamaan** tanpa mengedit berkas yang
sama. Aturan kerja bersama ada di [`KOORDINASI-AGEN.md`](KOORDINASI-AGEN.md).

- **TUGAS CD n** — dikerjakan Claude Code di `~/PROYEK/monitor karya` (cabang `desain-baru`).
- **TUGAS CX n** — dikerjakan Codex di `~/PROYEK/monitor-karya-codex` (cabang `codex/kerja`).

Cara memakai:

1. Ambil tugas yang statusnya **siap** dan tidak terhalang ketergantungan.
2. Ubah statusnya menjadi **dikerjakan** di tabel ringkas (di cabang Anda sendiri).
3. Edit **hanya** berkas di kolom "Zona". Butuh berkas lain? Tulis di bagian
   "Permintaan lintas zona" di bawah, jangan diedit langsung.
4. Commit dengan awalan kode tugas, mis. `CX 3: CI GitHub Actions untuk tsc, lint, tes, build`.
5. Selesai bila semua kriteria terpenuhi dan `npx tsc --noEmit`, `npx eslint src`,
   `npx vitest run` lolos. Ubah status menjadi **selesai**.

## Ringkas

| Kode | Judul | Pemilik | Status | Bergantung pada |
|---|---|---|---|---|
| TUGAS CD 1 | Data contoh pratinjau untuk semua API | Claude | dikerjakan (workflow F3-A/B) | — |
| TUGAS CD 2 | Tes route peran, admin, grup, keamanan | Claude | dikerjakan (workflow F3-C/D) | — |
| TUGAS CD 3 | Audit mutu desain semua layar | Claude | menunggu (workflow F4-A/B) | CD 1 |
| TUGAS CD 4 | Integrasi akhir: build + uji Docker | Claude | menunggu (workflow) | CD 1–3 |
| TUGAS CD 5 | Dokumentasi akhir & matriks fungsi per peran | Claude | menunggu (workflow) | CD 4 |
| TUGAS CD 6 | Commit bertahap cabang `desain-baru` | Claude | menunggu persetujuan pengguna | CD 5 |
| TUGAS CD 7 | Gabungkan hasil Codex + tulis migrasi dari usulan skema | Claude | menunggu | CD 6, semua CX selesai |
| TUGAS CD 8 | Hapus 44 berkas UI tak terpakai & paket npm-nya | Claude | menunggu persetujuan pengguna | CD 7 |
| TUGAS CX 1 | Buka kunci berlaku untuk bukti (unggah/hapus) | Codex | selesai | — |
| TUGAS CX 2 | Papan task mingguan menandai hari yang dibekukan | Codex | selesai | — |
| TUGAS CX 3 | CI GitHub Actions | Codex | selesai | — |
| TUGAS CX 4 | Basis data lokal di Docker untuk pengembangan | Codex | selesai | — |
| TUGAS CX 5 | Data seed untuk semua model baru | Codex | selesai | CX 4 (untuk uji) |
| TUGAS CX 6 | Tinjauan & pengujian paket deploy VPS | Codex | selesai | — |
| TUGAS CX 7 | Driver penyimpanan bukti yang bisa diganti (S3/MinIO) | Codex | selesai | — |

---

## Tugas Claude Code (CD)

CD 1–5 sudah berjalan otomatis lewat workflow multi-agen (Fase 3 dan 4). Zona yang
dipegangnya tercatat di `KOORDINASI-AGEN.md` → "Zona aktif".

### TUGAS CD 1 — Data contoh pratinjau
- **Zona:** `src/components/preview/**`
- **Kriteria:** setiap tab setiap peran di `/pratinjau?peran=…` tampil tanpa keadaan galat.

### TUGAS CD 2 — Tes route
- **Zona:** `tests/api/**` (kecuali `tests/cx/**`), `vitest.config.*`
- **Kriteria:** semua route P2/F2 punya tes cakupan peran, validasi, dan transisi status.

### TUGAS CD 3 — Audit mutu desain
- **Zona:** berkas UI di `src/components/**` (kecuali zona CX 2), CSS di `src/app/**`.
- **Kriteria:** `docs/design/15-checklist-review.md` lolos di 1440/834/390 px, terang/gelap, keyboard, zoom 200%.

### TUGAS CD 4 — Integrasi akhir
- **Zona:** perbaikan galat di mana pun (hanya agen integrasi yang mengedit saat itu).
- **Kriteria:** `tsc`, `eslint`, `vitest`, `next build`, dan uji Docker image lolos.

### TUGAS CD 5 — Dokumentasi akhir
- **Zona:** `docs/fitur/**`, `docs/SISA-PEKERJAAN.md`
- **Kriteria:** `docs/fitur/matriks-fungsi-peran.md` lengkap untuk 9 peran.

### TUGAS CD 6 — Commit bertahap
- Commit per area (sistem desain, kerangka, Ringkasan, Perusahaan & akun, Meja kerja, layar P1, fitur per peran + migrasi, tes, keamanan, deploy, dokumentasi). **Hanya setelah pengguna setuju.**

### TUGAS CD 7 — Gabungkan Codex
- `git merge --no-ff codex/kerja` ke `desain-baru`, selesaikan konflik (utamakan versi Claude di zona Claude).
- Tulis migrasi bernomor berikutnya dari `docs/usulan-skema/*.md` buatan Codex.

### TUGAS CD 8 — Bersihkan berkas tak terpakai
- 39 komponen `src/components/ui/*`, `use-mobile.ts`, `components/index.ts`, `stat-card.tsx`, `loading-states.tsx`, lalu paket npm yang tak lagi dipakai. **Hanya setelah pengguna setuju.**

---

## Tugas Codex (CX)

Semua tugas CX boleh dikerjakan bersamaan dengan workflow Claude, karena zonanya
tidak disentuh agen mana pun.

### TUGAS CX 1 — Buka kunci berlaku untuk bukti
- **Masalah:** `src/lib/evidence-access.ts` menganggap laporan harian terkunci bila `isLocked` atau lewat 17.00, tanpa memeriksa buka kunci. Akibatnya, di hari yang sudah dibuka PIC bisa mengubah teks tetapi tidak bisa menambah/menghapus bukti, dan pengiriman gagal bila status wajib bukti.
- **Zona:** `src/lib/evidence-access.ts`, `tests/cx/evidence-access.test.ts` (baru).
- **Kerjakan:** `locked = (r.isLocked || r.forwardedAt || isDailyLocked(r.reportDate)) && !(await activeUnlockFor('DAILY_REPORT', id))`; perlakuan sama untuk target `TASK` (lewat laporan harian hari tugas itu). Fungsi `activeUnlockFor` ada di `src/lib/unlock-requests.ts` — panggil, jangan diubah.
- **Kriteria:** tes untuk laporan terkunci, dibuka, buka kunci kedaluwarsa, dan dikunci ulang lebih awal.

### TUGAS CX 2 — Papan task mingguan menandai hari beku
- **Masalah:** `GET /api/tasks?week=` sudah mengirim `frozenDays`, tetapi `src/components/weekly-task-board.tsx` belum memakainya. API menolak edit dengan 409, tetapi papan tidak menunjukkan kuncinya lebih dulu.
- **Zona:** `src/components/weekly-task-board.tsx`, `src/app/css/weekly-task.css` (baru, impor satu baris di `src/app/globals.css` — tulis di "Permintaan lintas zona" bila ragu).
- **Kerjakan:** lajur hari beku tampil terkunci (ikon kunci + teks "Diteruskan ke holding · ajukan buka kunci"), kartu tidak bisa diseret ke/dari lajur itu, tombol tambah tersembunyi.
- **Kriteria:** tidak ada permintaan PATCH/PUT yang dikirim untuk hari beku; keyboard & pembaca layar mendapat keterangan kunci.

### TUGAS CX 3 — CI GitHub Actions
- **Zona:** `.github/workflows/ci.yml` (baru).
- **Kerjakan:** pada push & pull request: `npm ci`, `npx prisma generate`, `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`, `npx next build` (dengan `DATABASE_URL`/`DIRECT_URL` tiruan `postgresql://x:y@127.0.0.1:1/db`, `AUTH_SECRET` acak), lalu `docker build --target runner .`. Tembolok npm, batas waktu, izin `contents: read`.
- **Kriteria:** berkas YAML sah; tidak ada rahasia sungguhan di dalamnya.

### TUGAS CX 4 — Basis data lokal untuk pengembangan
- **Tujuan:** pengembang (dan akun uji seperti `admin`) bisa masuk di `/login` tanpa Supabase.
- **Zona:** `docker-compose.dev.yml` (baru), `scripts/db-lokal.sh` (baru), `.env.lokal.example` (baru), `docs/codex/db-lokal.md` (baru).
- **Kerjakan:** PostgreSQL 17 di Docker, hanya mengikat `127.0.0.1:54329`; skrip `naik | turun | ulang | migrasi | seed` yang **menolak berjalan** bila `DATABASE_URL` bukan localhost; migrasi lokal lewat `prisma migrate deploy` ke basis data lokal saja.
- **Pengecualian aturan:** `prisma migrate deploy` dan seed **boleh** untuk basis data lokal ini saja. Supabase tetap dilarang.
- **Kriteria:** dari nol, `bash scripts/db-lokal.sh naik && bash scripts/db-lokal.sh migrasi && bash scripts/db-lokal.sh seed` menghasilkan basis data lengkap, lalu `npx tsx scripts/buat-superadmin.ts admin --izinkan-lemah` bisa membuat akun uji.

### TUGAS CX 5 — Data seed untuk model baru
- **Zona:** `scripts/seed.ts`.
- **Kerjakan:** isi contoh untuk model yang belum punya seed: `Output` (+ bukti tautan, `OutputRevision`), `ProjectNote`/`NoteRead`, `ProjectStage`, `DeadlineProposal`, `Attendance`, `AccessRequest`, `ReminderRule`, `WeeklyReportRead`, `WeeklyReportComment`, `ProjectReview`, `ApprovalRequest`; isi `User.divisionId` dan `Project.divisionId` untuk data seed. Baca skema terbaru di `prisma/schema.prisma`.
- **Kriteria:** seed berjalan bersih di basis data lokal CX 4 dan bisa diulang (idempoten atau mengosongkan dulu, hanya di lokal).

### TUGAS CX 6 — Tinjauan & pengujian paket deploy VPS
- **Zona:** `deploy/**`, `Dockerfile`, `.dockerignore`.
- **Kerjakan:** periksa skrip dengan `shellcheck` (pasang manual di luar sandbox bila perlu), uji `deploy/app-vps/docker-compose.yml` dan `deploy.sh` di mesin lokal sejauh mungkin (tanpa server sungguhan), perbaiki temuan, tambahkan `deploy/CHECKLIST-RILIS.md`.
- **Kriteria:** `bash -n` dan `shellcheck -S warning` bersih; `docker compose -f deploy/app-vps/docker-compose.yml config` sah; tidak ada port aplikasi yang terbuka selain lewat Caddy.

### TUGAS CX 7 — Driver penyimpanan bukti
- Dibuka oleh permintaan pengguna untuk mengerjakan CX 1 sampai CX 7 pada 6 Oktober 2026. **Supabase tetap driver bawaan**; S3/MinIO menjadi pilihan konfigurasi server, tanpa memindahkan data atau mengubah penyimpanan aktif.
- Rancangan bila dibuka: `STORAGE_DRIVER=supabase|s3` di `src/lib/storage.ts`, bawaan `supabase`, perilaku tidak berubah.

---

## Permintaan lintas zona

Tulis di sini bila sebuah tugas butuh perubahan di zona pihak lain.

| Dari | Untuk | Berkas | Perubahan yang diminta | Status |
|---|---|---|---|---|
| CX 2 | Claude CD 1 | `src/components/preview/mock-pic.ts` | Pratinjau laporan mingguan PIC perlu mock `/api/progress-reports` dan `/api/tasks?week=` dengan `frozenDays`, agar visual hari beku dapat diuji. | diterapkan di codex/kerja |
| CX 2 | Claude CD 3 | `src/components/weekly-board.tsx` | Prop opsional `disabledLanes` dan `renderLaneNote` agar lajur beku tetap pada urutan kronologis satu papan. CX2 sekarang menampilkan bagian baca-saja terpisah dengan guard mutasi. | diterapkan di codex/kerja |
| CX 7 | Claude CD 4 | `src/lib/security-headers.ts` | Izinkan origin storage S3 yang dipilih konfigurasi pada img/media/connect CSP (tanpa wildcard). CSP sekarang hanya mengenal Supabase, sehingga preview gambar S3 di produksi diblokir. | diterapkan di codex/kerja |
| CX 7 | Claude CD 4 | `src/app/api/evidence/upload/route.ts` | Pesan needsConfig masih hanya menyebut SUPABASE_SERVICE_ROLE_KEY; sesuaikan dengan driver aktif. Ekspor/fungsi driver tetap kompatibel. | diterapkan di codex/kerja |

## Sinkronisasi

Codex bekerja dari potret pekerjaan Claude. Untuk mengambil potret terbaru:

```bash
# di folder Claude (oleh manusia atau Claude)
bash scripts/sinkron-codex.sh
# di folder Codex
git merge --no-edit codex/basis
```

`sinkron-codex.sh` hanya memindahkan cabang `codex/basis` ke potret pohon kerja
Claude saat itu; folder dan cabang Claude tidak berubah.

## Serah terima CX 1–7

Implementasi dan kriteria pemeriksaan CX selesai pada 6 Oktober 2026. Hasil integrasi dan batas verifikasi ada di [docs/codex/README.md](codex/README.md). Tindak lanjut lintas zona di atas telah diterapkan dan diuji di codex/kerja. CI tersedia pada cabang integrasi setelah push. Tidak ada merge ke desain-baru atau akses Supabase.
