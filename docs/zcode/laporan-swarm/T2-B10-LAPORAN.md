# T2-B10 — Laporan informasi kesehatan build & dependensi

Disusun 8 Oktober 2026 oleh agen T2-B10. Laporan informasi saja: **tidak ada kode yang diubah**; satu-satunya berkas yang dibuat/berubah adalah laporan ini.

Snapshot repo saat pemeriksaan: commit `6327963` (DOCS: gladi rilis Docker lulus…), dengan kerja lain yang sedang berjalan di pohon kerja: `prisma/schema.prisma` termodifikasi dan `prisma/migrations/0029_auditlog_operational_index/` belum terlacak — ikut dalam build Docker yang diukur di bawah (lihat Batasan).

## 1. Inventaris dependensi

`npm ls --depth=0` lulus bersih (exit 0, tanpa missing/extraneous/invalid): **33 paket tingkat atas = 20 dependencies + 13 devDependencies**, persis seperti `package.json`. `braces@3.0.3-mk.1` tampil dengan label `overridden` sesuai overrides (`micromatch@4.0.8` → `$braces`). Ada dua lockfile: `package-lock.json` (339 KB, dipakai `npm ci` di Dockerfile) dan `bun.lock` (328 KB, hanya untuk alat lain).

Versi terpasang umumnya lebih baru dari spesifikasi rentang (mis. `@radix-ui/*` 1.1.23 vs `^1.1.14`, `react` 19.2.8, `framer-motion` 12.43.0, `sonner` 2.0.8) — konsisten dengan semver, dikunci lockfile.

### Dependensi produksi yang dipakai area sempit (hasil grep impor di `src/`)

| Paket | Berkas pengimpor | Catatan |
|---|---|---|
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | hanya `src/components/weekly-board.tsx` | 3 paket untuk satu layar |
| `@radix-ui/react-alert-dialog` | hanya `src/components/mk/confirm-dialog.tsx` | useConfirm |
| `@radix-ui/react-popover` | hanya `src/components/shell.tsx` | |
| `@radix-ui/react-dialog` | `src/components/mk/sheet.tsx`, `src/components/search/command-palette.tsx` | |
| `@supabase/supabase-js` | hanya `src/lib/storage.ts` | Supabase Storage |
| `framer-motion` | hanya `src/components/dock.tsx`, `src/components/splash-screen.tsx` | |
| `clsx`, `tailwind-merge` | hanya `src/lib/utils.ts` (helper `cn`) | dipakai luas tak langsung |
| `tailwindcss-animate` | hanya `tailwind.config.ts` | efektif build-time walau masuk `dependencies` |

Yang luas: `next` (94 berkas), `react` (85), `sonner` (47), `@prisma/client` (21), `next-themes` (4), `react-dom` (1 impor langsung `flushSync` di `src/lib/nav-transition.ts`; sisanya via Next), `server-only` (27 berkas `lib/` memakai `import 'server-only'`).

Tanpa impor langsung tapi tetap wajar di produksi: `prisma` (CLI untuk `prisma generate` saat build dan tahap `migrate` di Dockerfile), `sharp` (optimasi gambar `next/image` saat runtime, dipakai otomatis Next; tidak dirujuk `next.config.ts`).

## 2. Pemetaan pemakai tiga grafik/API tertunda

Bukti grep (string apa pun, termasuk jalur impor, di seluruh `src/`, `tests/`, `scripts/`):

- `src/components/views/management-charts.tsx` (350 baris) — string `management-charts` hanya muncul di **berkas itu sendiri** (komentar + `useFetch('/api/management-charts')`) dan di log pesan error `src/app/api/management-charts/route.ts`. **Tidak ada komponen lain yang mengimpornya.**
- `src/components/dashboard/compliance-treemap.tsx` (144 baris) — string `compliance-treemap` **nol kemunculan** di konten `src/` mana pun selain nama berkasnya; rujukan `/api/compliance-map` hanya ada di dalam berkas itu. **Tidak diimpor siapa pun.**
- `src/components/dashboard/kpi-trend-chart.tsx` (62 baris) — string `kpi-trend-chart` **nol kemunculan**; rujukan `/api/kpi-trends` hanya di dalam berkas itu. **Tidak diimpor siapa pun.**
- Tidak ada rujukan ketiganya di `tests/` maupun `scripts/` — sejalan dengan memo bahwa belum ada tes yang menyentuhnya.

### Endpoint dan guard (dibaca dari berkas route)

| Endpoint | Berkas | Guard |
|---|---|---|
| `GET /api/management-charts` | `src/app/api/management-charts/route.ts` (213 baris) | `requireApiUser()`; cakupan `scopeEntityIds(user)` — Manajemen baca seluruh grup, peran sempit dibatasi subpohonnya (`entityId: { in: allowedIds }`) |
| `GET /api/compliance-map` | `src/app/api/compliance-map/route.ts` (150 baris) | `requireApiUser()`; `refuseUnscoped(user)`; `resolveScopeEntityId(user, query scopeEntityId)` |
| `GET /api/kpi-trends` | `src/app/api/kpi-trends/route.ts` (84 baris) | `requireApiUser()`; `refuseUnscoped(user)`; `resolveScopeEntityId(user, query scopeEntityId)` |

Ketiganya GET-saja dengan guard sesi + batas cakupan entitas — memperkuat fakta di `docs/zcode/USULAN-GRAFIK-TERTUNDA.md` (opsi C: tertunda, ter-guard, tanpa pemakai). Total komponen+API yang menggantung: **1.003 baris**.

## 3. Ukuran image Docker (target runner)

`docker build --target runner -t mk-b10:tmp .` **lulus** (exit 0, sebagian besar lapisan dari cache; tahap `next build` terlihat ± 19 detik). Tanpa kegagalan jaringan — image dasar `node:22.23.3-bookworm-slim` sudah tersedia lokal.

- `docker images mk-b10:tmp` → **597 MB disk usage / 142 MB content size** (containerd/overlayfs: content = termampat, disk = termasuk snapshot ter-unpack), ID `773f0163e0c0`.
- 5 lapisan terbesar (`docker history --format '{{.Size}}\t{{.CreatedBy}}'`):

| # | Ukuran | Lapisan |
|---|---|---|
| 1 | 149 MB | lapisan resmi image dasar node (Node 22.23.3) |
| 2 | 126 MB | `COPY /app/.next/standalone` — aplikasi standalone output Next |
| 3 | 51,5 MB | `RUN npm install --global npm@11.19.1` (tahap `base`, ikut ke runner) |
| 4 | 11,1 MB | `apt-get install openssl ca-certificates` |
| 5 | 7,26 MB | lapisan yarn bawaan image dasar resmi |

Lapisan aplikasi lain: `.next/static` 1,99 MB, `public` 8,19 kB. Image **sudah dihapus** setelah pengukuran (`docker rmi` terkonfirmasi).

## 4. Konteks build dan .dockerignore

Dikecualikan oleh `.dockerignore`: `.git`, `.next` (799 MB), `node_modules` (772 MB), `.env*` (kecuali `.env.example`), `*.log`, `coverage`, `tests`, `docs` (14 MB), `deploy`, `design-system/**/*.html`, `.claude`, `.vercel`, `Dockerfile`, `.dockerignore`, kredensial/cadangan (`*.pem`, `*.key`, `*.dump`, `*.dump.age`, `*.sql.age`, `.ssh`, `.aws`, `.agents`, `.codex`), dan `scripts/uji-alur-lokal.ts`.

Konteks yang benar-benar masuk ≈ **5,8 MB** — sehat. Yang masuk tapi berpotensi membesar/mengecewakan nanti (tidak sampai ke runner karena tahap runner hanya menyalin `standalone`, `static`, `public`, tetapi ikut `COPY . .` di tahap `build`):

- `db/custom.db` — **basis data SQLite 848 KB** (aktif, counter 2191) ikut konteks dan tahap build; tidak cocok pola pengecualian apa pun.
- `upload/prompt_fullstack_monitoring_bisnis_1.md` (24 KB, dokumen kebutuhan) dan `download/`, `examples/`, `mini-services/`, `agent-ctx/`, `.zscripts/`, `SUPABASE_SETUP.md` (36 KB), `worklog.md` (12 KB) — dokumen/alat lokal yang tidak dipakai build.
- `tsconfig.tsbuildinfo` 312 KB dan `bun.lock` 324 KB — artefak mesin lokal.
- Pengecualian `tests` membuat `COPY . .` aman, tetapi `scripts/` lain ikut (± 100 KB, ada catatan di .dockerignore bahwa runner E2E butuh `tests/` yang di-mount saat uji terisolasi).

## 5. Rekomendasi (informasi saja, tidak dieksekusi)

1. **Konteks**: pertimbangkan mengubah `.dockerignore` dari daftar tolak menjadi daftar izin (atau menambah `db/`, `upload/`, `download/`, `examples/`, `mini-services/`, `agent-ctx/`, `.zscripts/`, `*.db`, `bun.lock`, `tsconfig.tsbuildinfo`) — potensi hemat kecil hari ini (± 1,6 MB) tetapi mencegah `db/custom.db` atau berkas lokal lain membesar tanpa sengaja.
2. **Image runner**: lapisan `npm install --global npm@11.19.1` (51,5 MB) diwarisi runner meski runtime hanya menjalankan `node server.js`. Memindahkan peningkatan npm hanya ke tahap `deps`/`build` (runner `FROM node:` murni) akan memangkas runner ± 50 MB — perlu penyesuaian Dockerfile, bukan bagian laporan ini.
3. **Dependensi sempit**: `tailwindcss-animate` dan `tw-animate-css` kembar fungsi; `tailwindcss-animate` hanya dipakai `tailwind.config.ts` — kandidat penyeragaman saat pembersihan (perlu verifikasi mana yang benar-benar dipakai preset). Tiga paket `@dnd-kit` hanya untuk satu layaran; wajar dipertahankan.
4. **Tiga grafik tertunda**: fakta di bagian 2 mengonfirmasi memo `USULAN-GRAFIK-TERTUNDA.md` — 1.003 baris tanpa pemakai dan tanpa tes, endpoint ter-guard. Keputusan tetap milik pemilik; laporan ini hanya menambah bukti.
5. **Reproduksibilitas**: hasil build di atas memuat `prisma/schema.prisma` termodifikasi + migrasi 0029 yang belum di-commit dari agen lain — angka image bisa bergeser setelah pekerjaan itu disatukan.

## Batasan

- Laporan informasi; tidak ada perubahan kode, tidak ada commit.
- Ukuran image dari build ber-cache pada satu mesin (Apple Silicon, Docker containerd); angka `docker history` adalah ukuran lapisan tak termampat, sedangkan "content size" 142 MB adalah total termampat — dua ukuran berbeda tujuan.
- Pemakaian dependensi diukur dari grep impor langsung di `src/` + konfigurasi; pemakaian tak langsung (mis. `sharp` oleh Next, `cn` oleh ratusan komponen) disebut kualitatif.
- Tidak menjalankan `npx next build` di repo (aturan tugas); kesehatan build dilihat lewat Docker saja. Gerbang tes/lint tidak dijalankan ulang — lihat `docs/zcode/06-STATUS-DAN-PENGUJIAN.md` untuk angka tersimpan.
