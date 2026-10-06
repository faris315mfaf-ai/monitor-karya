# Serah terima Monitor Karya: Claude Code → Codex

Tanggal: 6 Oktober 2026 · Dari: Claude Code · Kepada: Codex · Pemilik: T1ngky

Dokumen ini menyerahkan pengerjaan Monitor Karya ke Codex sebagai **pemegang
utama**. Baca seluruhnya sebelum mengubah apa pun. Bagian 1 cukup untuk mulai;
bagian lain menjadi rujukan.

---

## 1. Ringkas satu menit

- **Apa:** aplikasi Next.js 16 + Prisma + PostgreSQL untuk memantau laporan
  harian proyek dan capaian mingguan divisi di grup perusahaan (holding → PT →
  divisi → proyek). Sembilan peran, UI berbahasa Indonesia, sistem desain sendiri.
- **Di mana:** repo `https://github.com/faris315mfaf-ai/monitor-karya`, cabang
  kerja **`desain-baru`** (28 commit di depan `main`, belum di-push).
- **Keadaan:** semua layar sudah desain baru; semua fungsi per peran dari
  spesifikasi sudah dibangun di kode; 872 tes lolos; build dan Docker image
  lolos. **Belum pernah dijalankan terhadap basis data sungguhan** — migrasi
  0013–0025 belum diterapkan ke Supabase.
- **Pekerjaan Anda berikutnya:** TUGAS CX 8–CX 15 di bagian 10, urut prioritas.
- **Tiga larangan mutlak:** jangan sentuh Supabase / basis data server
  (migrasi, seed, kueri tulis); jangan push atau buka PR tanpa izin pemilik;
  jangan rebase/reset/force-push.

---

## 2. Identitas & tata letak

| Hal | Nilai |
|---|---|
| Repo | `origin` = https://github.com/faris315mfaf-ai/monitor-karya.git |
| Cabang utama kerja | `desain-baru` (HEAD saat serah terima: `CD 8: hapus 43 berkas UI tak terpakai dan 41 paket npm`) |
| Cabang Codex | `codex/kerja` — sudah di-fast-forward ke `desain-baru` |
| Folder Claude | `~/PROYEK/monitor karya` (dev server port 3100, tanpa basis data) |
| Folder Codex | `~/PROYEK/monitor-karya-codex` (worktree; dev server port 3200 dengan DB lokal) |
| Node | 22 (Docker) / ≥ 20 (`engines`); lokal terpasang 26 |
| Next.js | ^16.3.8 — **bukan Next yang Anda kenal**; baca `node_modules/next/dist/docs/` sebelum memakai API Next (lihat `AGENTS.md`) |
| Prisma | 6.19.3, PostgreSQL |
| Tes | Vitest (`npm test`) |

Setelah serah terima, kerja di `codex/kerja` (worktree Codex). Bila pemilik
meminta, `desain-baru` boleh di-fast-forward dari `codex/kerja`.

**Langkah pertama di worktree Codex** (paket npm berubah di CD 8):

```bash
cd ~/PROYEK/monitor-karya-codex
npm ci && npx prisma generate
npx tsc --noEmit && npx eslint src && npx vitest run
```

---

## 3. Riwayat commit cabang `desain-baru`

| Commit | Isi |
|---|---|
| `cf21a2b` | Sistem desain: `design-system/`, token, komponen `src/components/mk`, `docs/design/` |
| `d9f9cc8` | Skema & migrasi 0013–0025 |
| `f01dcbe` | API & logika (`src/app/api`, `src/lib`, `src/proxy.ts`) |
| `fbd2881` | Layar per peran, kerangka (shell, Dock, login), pratinjau |
| `f4a61e4` | Tes vitest |
| `f0a3c1d` | Deploy VPS, Docker, header keamanan, skrip akun & koordinasi |
| `d7bc24d` | Dokumentasi (`docs/fitur/`, keamanan, koordinasi) |
| `e120407` | CD 7: gabungan pekerjaan Codex CX 1–7 |
| `39daa5d` | CD 8: hapus 43 berkas UI & 41 paket npm tak terpakai |

Bukti pemeriksaan pada `39daa5d` (dijalankan Claude): `tsc` 0 galat, `eslint src`
bersih, Vitest **47 berkas / 872 tes lolos**, `next build` lolos (dengan
`DATABASE_URL` tiruan), `docker build --target runner` lolos; runner sehat,
non-root, read-only, `/login` 200, `/pratinjau` 404 di produksi, `/api/cron/*`
tanpa rahasia 401.

---

## 4. Menjalankan

### Pratinjau tanpa basis data (paling cepat)
`npx next dev -p 3100` lalu buka `/pratinjau?peran=` salah satu:
`MANAJEMEN, DIREKTUR_ENTITAS, DIREKTUR_SDM_GA, KEPALA_DIVISI, ADMIN_PT,
PIC_PROYEK, TI, AUDITOR, SUPERADMIN`. Data contoh ada di
`src/components/preview/` (dipasang lewat `window.fetch` tiruan; hanya dev).

### Dengan basis data lokal (login sungguhan)
Panduan: [`docs/codex/db-lokal.md`](codex/db-lokal.md). PostgreSQL 17 di Docker,
hanya loopback. Port 54329 dipakai layanan lain di mesin ini, jadi pakai **54339**
(`LOCAL_DB_PORT=54339`). Kontainer `monitor-karya-dev-postgres-1` sudah berjalan,
migrasi + seed sudah diterapkan, server dev Codex di **http://localhost:3200**.

Akun uji lokal: username **`admin`** (Super Admin). Kata sandinya disetel pemilik
lewat `scripts/buat-superadmin.ts --izinkan-lemah` dan **tidak dicatat di repo**.
Kata sandi lemah hanya diterima skrip itu untuk host localhost.

### Tes, build, Docker
```bash
npx vitest run
DATABASE_URL=postgresql://x:y@127.0.0.1:1/db DIRECT_URL=postgresql://x:y@127.0.0.1:1/db \
  AUTH_SECRET=$(openssl rand -hex 32) npx next build
docker build --target runner -t mk-uji .
```

---

## 5. Aturan wajib (berlaku mulai serah terima)

1. **Basis data sungguhan dilarang.** Tidak ada `prisma migrate deploy/dev`,
   `db push`, `db execute`, seed, atau skrip tulis ke Supabase atau server. Hanya
   basis data lokal Docker (54329/54339) yang boleh dimigrasi dan di-seed.
2. **Migrasi:** kini Codex boleh **menulis** migrasi baru, bernomor mulai
   **0026** (nomor 0020, 0022, 0024 sengaja kosong — tidak perlu diisi). SQL
   ditulis tangan mengikuti gaya `prisma/migrations/0016_*`, termasuk
   `ENABLE ROW LEVEL SECURITY`; uji di DB lokal; jangan pernah diterapkan ke Supabase.
3. **Git:** commit kecil per topik, pesan bahasa Indonesia, awali kode tugas
   (`CX 9: …`). Tanpa rebase/reset/force-push. **Push/PR hanya dengan izin
   eksplisit pemilik** (repo publik; push sebelumnya ditolak pemeriksaan otomatis).
4. **Rahasia:** jangan menulis kata sandi, token, atau URL basis data sungguhan
   di berkas apa pun, termasuk laporan `docs/codex/*`.
5. **Desain & bahasa:** ikuti `AGENTS.md` dan `DESIGN.md` — nilai visual hanya
   dari token (`design-system/tokens.css`), komponen `src/components/mk`, bahasa
   Indonesia, sapaan "Anda", sentence case, tanpa tanda seru/emoji, status selalu
   `StatusBadge`, detail di `Sheet`, maks 4 KPI, maks 1 tombol primer per kartu.
6. **Pemeriksaan sebelum setiap commit:** `tsc`, `eslint src`, `vitest run`.
   Sebelum menyatakan tugas selesai: juga `next build` dengan URL tiruan.
7. **`next dev` menulis ulang blok di `AGENTS.md`.** Biarkan dan ikut commit.
8. **Laporan hasil** tiap tugas di `docs/codex/CX<n>-HASIL.md`: apa yang diubah,
   bukti pemeriksaan, apa yang belum. Jujur — jangan klaim teruji bila tidak.

---

## 6. Arsitektur singkat

```
src/app/            App Router: page.tsx (AppShell), login/, pratinjau/, api/** (68 route)
src/proxy.ts        Proxy Next: CSP bernonce, CSRF (cek Origin), header keamanan, /pratinjau 404 di produksi
src/lib/            auth (sesi, mustChangePassword), rbac (kapabilitas & ROLE_TABS), lock (tenggat WIB),
                    daily-rollup (dailyGate, beku/buka kunci), unlock-requests, evidence-access,
                    storage (Supabase bawaan, S3/MinIO opsional), security, kpi-math, kadiv, reminder-*
src/components/mk/  Komponen desain (port TSX design-system): Button, Card, Sheet, StatusBadge, grafik …
src/components/     shell.tsx & dock.tsx (navigasi), views/ (layar tab), work-desk/, pic/, kadiv/,
                    admin/, oversight/, group/, companies/, search/, preview/ (data contoh)
prisma/             schema.prisma + migrations 0001–0025
tests/              api/, lib/, cx/ (tes Codex), stubs/
deploy/             paket VPS: harden, WireGuard, PostgreSQL, backup terenkripsi, Caddy, compose, cron
docs/               fitur/ (dokumentasi per modul + matriks), design/ (panduan), codex/ (laporan Codex)
```

Rujukan utama:
- [`docs/fitur/README.md`](fitur/README.md) — indeks, env, migrasi manual.
- [`docs/fitur/arsitektur.md`](fitur/arsitektur.md) — alur permintaan, kapabilitas 9 peran, tenggat WIB.
- [`docs/fitur/matriks-fungsi-peran.md`](fitur/matriks-fungsi-peran.md) — setiap fungsi per peran, layar, endpoint, status.
- [`docs/KEAMANAN.md`](KEAMANAN.md) — keputusan keamanan.
- `docs/design/peran/00–08` — spesifikasi layar per peran.

Konsep yang sering salah dipahami:
- **Waktu:** semua tenggat dihitung WIB (`src/lib/lock.ts`). Tanggal laporan dan
  tugas disimpan sebagai **tengah malam WIB** (`startOfWibDay`, = 17.00 UTC hari
  sebelumnya). Jangan bandingkan dengan tengah malam UTC.
- **Alur harian:** PIC kirim → Admin PT → Admin teruskan ke holding → laporan
  **beku** (`forwardedAt` + `isLocked`). Ubah hanya lewat buka kunci:
  ajukan (PIC) → setujui → jalankan. Satu gerbang: `dailyGate` di `daily-rollup.ts`.
- **Alur mingguan:** kepala divisi serahkan paling lambat **Kamis 17.00**, kunci
  **Jumat 17.00** WIB; setujui hanya dari `MENUNGGU_PERSETUJUAN`; beku setelah diteruskan.
- **Bukti:** izin unggah/hapus di `evidence-access.ts` mengikuti gerbang yang sama.
- **Urungkan:** jendela 15 menit, pelaku yang sama (`UndoToken`).

---

## 7. Keputusan yang sudah diambil

Dari pemilik (wajib diikuti):
- Laporan harian PIC dikirim **langsung ke Admin PT**; kepala divisi hanya melihat.
- Laporan yang sudah diteruskan **dibekukan**; perubahan hanya lewat buka kunci.
- Tenggat mingguan: **serah Kamis 17.00, kunci Jumat 17.00** WIB.
- Penyimpanan bukti **tetap Supabase Storage** (driver S3/MinIO ada tetapi opsional, bawaan `supabase`).
- Sasaran deploy: **VPS** (Hostinger KVM 8 untuk aplikasi + VPS terpisah untuk PostgreSQL), bukan Vercel.

Bawaan dari orkestrator (belum dikonfirmasi pemilik — lihat `SISA-PEKERJAAN.md` bagian B):
kata sandi minimal 8 + wajib ganti untuk akun buatan admin; notifikasi hanya
milik sendiri; di antrean keputusan hanya "Terima semua" yang primer; warna
`data-1..6` khusus divisi; lonceng header disembunyikan di mode Dock.

**Jangan kerjakan butir bagian B `SISA-PEKERJAAN.md` tanpa keputusan pemilik.**

---

## 8. Migrasi

| Nomor | Isi | Status |
|---|---|---|
| 0001–0012 | Skema dasar s.d. pengajuan proyek berantai | Sudah di Supabase |
| 0013 | `Output` | **Belum diterapkan** |
| 0014 | `ProjectNote`, `ProjectStage`, `DeadlineProposal` | Belum |
| 0015 | `User.divisionId`, `Project.divisionId`, `Attendance` | Belum |
| 0016 | `AccessRequest`, `ReminderRule` | Belum |
| 0017 | `WeeklyReportRead` | Belum |
| 0018 | `User.mustChangePassword` | Belum |
| 0019 | `NoteRead`, `OutputRevision` | Belum |
| 0021 | `WeeklyDivisionSummary` (ringkasan mingguan ke Direktur), `DailyReportRead` | Belum |
| 0023 | `WeeklyReportComment`, `ProjectReview`, `ApprovalRequest`, kehadiran TERLAMBAT | Belum |
| 0025 | `UndoToken` | Belum |

Semua sudah lolos di DB lokal (Codex CX 4). **Akibat penting:** Prisma Client
sudah mengharapkan kolom baru, jadi aplikasi yang terhubung ke Supabase akan
galat sampai migrasi diterapkan oleh pemilik (langkah di `docs/fitur/README.md`
dan `deploy/README.md` langkah 7–8). Migrasi lama 0006 menyentuh `storage.buckets`
(khas Supabase); DB lokal memakai initializer tiruan untuk itu.

---

## 9. Variabel lingkungan

| Nama | Wajib | Catatan |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | ya | Supabase (pooler 6543 / langsung 5432) atau PostgreSQL VPS lewat WireGuard |
| `AUTH_SECRET` | ya | ≥ 32 karakter acak; tanda tangan sesi |
| `CRON_SECRET` | untuk cron | ≥ 16 karakter; dibandingkan waktu-konstan |
| `APP_ORIGINS` | di balik proxy | asal sah untuk cek CSRF, dipisah koma |
| `NEXT_PUBLIC_SUPABASE_URL` | untuk bukti | diisi **saat build** supaya CSP mengizinkan gambar bukti |
| `SUPABASE_SERVICE_ROLE_KEY` | untuk unggah | hanya server; tanpa ini unggah 503, tautan bukti tetap jalan |
| `STORAGE_DRIVER` | tidak | `supabase` (bawaan) atau `s3` — lihat `docs/codex/penyimpanan.md` |
| `SEED_PASSWORD`, `SUPERADMIN_PASSWORD` | skrip | hanya untuk skrip seed/akun |
| `LOCAL_DB_PORT` | lokal | 54329 bawaan, 54339 di mesin ini |
| `DAILY_CUTOFF_HOUR`, `WEEKLY_CUTOFF_HOUR` | tidak | bawaan 17 |

Repo tidak menyimpan `.env` (diabaikan git); `.env.example` hanya placeholder.

---

## 10. Pekerjaan lanjutan untuk Codex

Urut prioritas. Zona = berkas yang boleh diubah tugas itu. Kriteria selesai umum:
pemeriksaan bagian 5 butir 6 lolos dan laporan `docs/codex/CX<n>-HASIL.md` ditulis.

### TUGAS CX 8 — Bug kecil yang diketahui (prioritas tinggi)
- **Zona:** `src/components/oversight/management-dashboard.tsx`, `src/components/admin/access-requests-card.tsx`, `src/app/api/kadiv/weekly-summary/**`, `src/app/api/unlock-requests/route.ts`, `src/app/api/admin/overview/route.ts`, `src/app/api/deadline-proposals/**`, tes terkait.
- **Kerjakan:**
  1. Subjudul kartu "Keputusan terbuka" Auditor hanya menyebut eskalasi.
  2. Sembunyikan "Ajukan permintaan" untuk TI, atau ambil daftar akun dari `/api/access-requests/options`.
  3. Kirim ringkasan mingguan: cegah kirim ganda bersamaan (kondisional `updateMany`/transaksi), kode 409 "sudah terkirim" dibedakan dari `PENDING_REVIEW`.
  4. `PATCH /api/unlock-requests`: tolak (404/409) bila laporan sasaran tidak ada, jangan lewati cek cakupan.
  5. `/api/admin/overview`: buang hitungan kepatuhan per anggota versi lama atau samakan dengan `/api/admin/compliance`.
  6. Usulan tenggat yang tanggalnya sudah lewat: tolak saat disetujui (422) — **catat sebagai keputusan bawaan** di laporan.
- **Kriteria:** tiap butir punya tes yang gagal sebelum perbaikan.

### TUGAS CX 9 — Angka yang meleset
- **Zona:** route & komponen KPI "Tepat waktu 30 hari" (`src/lib/kadiv.ts`, `src/app/api/kadiv/**`), hero Proyek & Divisi (`src/app/api/projects/route.ts`, `src/app/api/weekly-reports/**`, `views/projects-view.tsx`, `views/divisions-view.tsx`).
- **Kerjakan:** penyebut tepat waktu memakai proyek yang aktif pada hari masing-masing (bukan aktif hari ini); API berhalaman mengembalikan `total`/ringkasan agar baris dukungan hero tidak hanya menghitung halaman yang dimuat.

### TUGAS CX 10 — Aksesibilitas & sistem desain sisa
- **Zona:** `src/components/mk/*`, `design-system/components/bundle.css`, `src/components/task-dialog.tsx`, `src/components/dock.tsx`, `src/components/shell.tsx`.
- **Kerjakan:** cadangan fokus `Sheet` bila pemicu sudah hilang (kasus palet ⌘K); `mk-choice` sebagai `radiogroup` dengan panah; grafik dengan navigasi panah (satu tab stop per grafik); angka batang `BarChart` tertulis di layar; target sentuh ≥ 44 px untuk tab bar mengambang, Dock, tab bar ponsel, batang AreaChart ponsel; animasi keluar Sheet akun di `AccountManager`.
- **Kriteria:** uji keyboard dan ukuran target di `/pratinjau` (1440/834/390), tanpa regresi visual di tema terang/gelap.

### TUGAS CX 11 — Data contoh pratinjau konsisten
- **Zona:** `src/components/preview/**`.
- **Kerjakan:** satu sumber nama divisi, proyek, dan skor untuk semua peran; `/api/search` tiruan dibatasi per peran seperti route sungguhan; `reportDateKey`/`todayKey` memakai tanggal WIB; jalankan buka kunci di tiruan (`execute`); modelkan `NoteRead` dan `OutputRevision`.
- **Kriteria:** butir "angka sama lintas peran" lolos di pratinjau; ⌘K menemukan "rina" untuk peran yang berhak.

### TUGAS CX 12 — Sisa komponen lama
- **Zona:** `src/components/ui/{alert-dialog,button,input,label,switch,textarea}.tsx`, pemakainya (`companies/parts.tsx`, `login/ganti-sandi/*`, `admin/access-request-sheet.tsx`), `src/app/globals.css`.
- **Kerjakan:** ganti dengan versi `mk`, hapus berkas `ui` yang tak terpakai lagi, hapus alias palet Tailwind lama di `globals.css`, cabut paket Radix yang tak terpakai.
- **Jangan** memutuskan nasib `management-charts.tsx`, `compliance-treemap.tsx`, `kpi-trend-chart.tsx` — itu keputusan pemilik; cukup catat pemakaiannya.

### TUGAS CX 13 — Infrastruktur proyek
- **Zona:** `package.json`, `prisma.config.ts` (baru), `prisma/migrations/0026_*` (baru), `.github/workflows/ci.yml`.
- **Kerjakan:** pindahkan `package.json#prisma` ke `prisma.config.ts`; atasi peringatan `allowScripts` (prisma, esbuild, sharp, @swc/core) dengan konfigurasi yang terdokumentasi; migrasi 0026 untuk indeks FK yang hilang (`Output.reviewerId`, `DeadlineProposal.decidedById`, `AccessRequest.decidedById`) — uji di DB lokal saja; peringatan Vite "ESM syntax in CommonJS" bila masih ada.

### TUGAS CX 14 — Uji alur antarperan di DB lokal
- **Zona:** `tests/e2e-lokal/**` (baru), `scripts/uji-alur-lokal.ts` (baru), `docs/codex/`.
- **Kerjakan:** otomatiskan skenario `SISA-PEKERJAAN.md` bagian A2 terhadap server dev + DB lokal (bukan Supabase): kirim laporan PIC → muncul di Admin; teruskan → beku → buka kunci; serah/setujui mingguan; terima output; setujui usulan tenggat; persetujuan cuti; akun wajib ganti sandi; perilaku setelah 17.00 (waktu tiruan). Skrip menolak berjalan bila `DATABASE_URL` bukan localhost.
- **Kriteria:** laporan per skenario lulus/gagal dengan bukti; bug yang ditemukan menjadi butir baru, bukan diperbaiki diam-diam.

### TUGAS CX 15 — Fitur kecil yang belum dibangun
- **Zona:** layar terkait masing-masing.
- **Kerjakan:** kolom cari di header Admin PT (membuka palet ⌘K); jenis bukti per output di kartu review; delta "rata-rata progres" Manajemen hanya bila ada data riwayat (bila butuh tabel baru: migrasi 0027, lokal saja).
- **Butuh keputusan pemilik, jangan dikerjakan sendiri:** tab Log untuk Direktur entitas (mengubah `ROLE_TABS`).

### Di luar wewenang Codex
- Menerapkan migrasi ke Supabase, rilis ke VPS, memasang crontab server — milik pemilik (`SISA-PEKERJAAN.md` bagian A1, A3).
- Semua butir bagian B (keputusan produk).
- Push/PR — hanya dengan izin.

---

## 11. Status dokumen lain

| Dokumen | Status |
|---|---|
| `docs/SISA-PEKERJAAN.md` | Sumber daftar terbuka. **Usang sebagian:** A4 (commit bertahap) sudah selesai di CD 6; butir C "weekly-task-board belum memakai frozenDays" sudah selesai di CX 2; pembersihan `ui/*` selesai di CD 8. Perbarui saat mengerjakan CX 8+. |
| `docs/PEMBAGIAN-TUGAS.md` | CD 1–8 dan CX 1–7 selesai. Tugas baru ada di dokumen ini (CX 8–15). |
| `docs/KOORDINASI-AGEN.md` | Masih berlaku untuk kerja bersama. Aturan migrasi digantikan bagian 5 butir 2 dokumen ini. |
| `docs/STATUS-LANJUTAN-CODEX.md` | **Usang** — ditulis saat workflow Claude baru 10/21 selesai. Kini 21/21 selesai. |
| `docs/codex/CX1–CX7-HASIL.md` | Laporan Codex; tetap berlaku. |
| `deploy/README.md`, `deploy/CHECKLIST-RILIS.md` | Panduan rilis VPS; belum diuji di server sungguhan. |

---

## 12. Jebakan yang sudah diketahui

- **Prisma Client vs Supabase:** client sudah memuat kolom 0013–0025; kueri ke Supabase yang belum dimigrasi akan gagal. Jangan "perbaiki" dengan mengubah skema — migrasinya yang tertunda.
- **Tanggal WIB:** tes yang memakai `new Date('…T00:00:00Z')` sebagai tanggal laporan salah; pakai `startOfWibDay`. Contoh perbaikan di `tests/cx/evidence-access.test.ts`.
- **Tiruan modul di Vitest:** `vi.mock('@/lib/lock', …)` penuh menghapus fungsi lain; pakai `importOriginal` lalu timpa yang perlu.
- **Port:** 54329 dipakai PostgreSQL lain di mesin ini; 3100 server Claude; 3200 server Codex.
- **CSP bernonce di produksi:** skrip inline baru (mis. boot tema) wajib memakai nonce dari `headers()`; uji dengan `next build && next start`, bukan `next dev`.
- **`/pratinjau`** hanya ada di dev (404 di produksi) — jangan dijadikan sandaran fitur.
- **Rahasia di laporan:** push Codex sebelumnya ditolak karena laporan memuat kata sandi lokal. Tulis "disetel lewat skrip", bukan nilainya.
- **Sandbox Codex tanpa jaringan:** `npm install` paket baru perlu dijalankan di luar sandbox oleh pemilik.

---

## 13. Daftar serah terima

| Diserahkan | Ada | Lokasi |
|---|---|---|
| Kode lengkap, ter-commit | ✓ | `desain-baru` @ `39daa5d`, `codex/kerja` sama |
| Skema & 10 migrasi baru (belum diterapkan) | ✓ | `prisma/` |
| Tes 872 lolos | ✓ | `tests/` |
| Pratinjau 9 peran tanpa DB | ✓ | `/pratinjau` |
| DB lokal + akun uji `admin` | ✓ | `docker-compose.dev.yml`, `docs/codex/db-lokal.md` |
| CI GitHub Actions | ✓ (belum pernah jalan; belum di-push) | `.github/workflows/ci.yml` |
| Paket deploy VPS | ✓ (belum diuji di server) | `deploy/`, `Dockerfile` |
| Dokumentasi fitur + matriks peran | ✓ | `docs/fitur/` |
| Daftar terbuka & keputusan tertunda | ✓ | `docs/SISA-PEKERJAAN.md`, bagian 10 dokumen ini |

**Konfirmasi penerimaan (diisi Codex):** setelah menjalankan langkah pertama di
bagian 2, tulis hasilnya di `docs/codex/SERAH-TERIMA-DITERIMA.md` (perintah, hasil,
selisih yang ditemukan terhadap dokumen ini) dan commit dengan pesan
`CX 8: terima serah terima dari Claude`.
