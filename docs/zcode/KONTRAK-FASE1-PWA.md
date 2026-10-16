# Kontrak Fase 1 — web & PWA untuk ponsel (16 Okt 2026)

Sumber: `docs/zcode/rancangan-mobile-subholding.html` bagian "Fase 1 · Web dan PWA".
Basis: branch `claude/subholding` HEAD `90cbc1a` (produksi). Migrasi terakhir 0035 → berikutnya **0036**.

Tujuan: semua peran subholding (Admin subholding, Supervisor, Superuser, Manajemen) nyaman di ponsel
tanpa pasang aplikasi. Anggaran: satu foto terunggah ≤ 600 KB, thumbnail dashboard ≤ 30 KB.

## Aturan bersama
- Nilai visual hanya token `design-system/tokens.css` / kelas bertoken. Indonesia, "Anda", tanpa emoji/tanda seru.
- Jangan tulis teks kelas yang memuat `*` di mana pun (Tailwind memindai berkas).
- Gerak: framer-motion, pegas kritis (`bounce: 0`); `useReducedMotion()` → pudar.
- Lint React compiler aktif: jangan baca `ref.current` saat render; properti bernama `*Ref` di objek yang dibaca
  saat render memicu galat `react-hooks/refs`. Jangan setState sinkron di badan effect.
- Jangan commit, jangan jalankan server/DB, jangan sentuh zona lain.
- Gerbang zona: `export DATABASE_URL='postgresql://x:y@127.0.0.1:1/db' DIRECT_URL=$DATABASE_URL;`
  `npx tsc --noEmit --incremental false; npx eslint <berkas>; npx vitest run <tes Anda>`.

## A — Foto & unggah Admin subholding
Zona: `src/lib/image-compress.ts` (baru), `src/components/views/sh-admin/*`, `tests/ui/image-compress.test.ts`,
`tests/ui/sh-admin-*.test.ts`.
1. `image-compress.ts`: kompres di peramban sebelum unggah — sisi terpanjang 1600px, JPEG kualitas 0,8,
   orientasi EXIF dibakar (`createImageBitmap(file, { imageOrientation: 'from-image' })`), metadata hilang
   karena digambar ulang ke kanvas (GPS ikut hilang). Hanya untuk `image/jpeg|png|webp|heic`; gif dan
   dokumen tidak disentuh. Gagal dekode (mis. HEIC di Chrome) → kembalikan berkas asli. Hasil lebih besar dari
   asli dan asli sudah ≤1600px → pakai asli. Nama berkas jadi `.jpg`. Logika ukuran (`fitSize`) murni + diuji.
2. `bukti-picker.tsx`: tombol **"Ambil foto"** (`accept="image/*" capture="environment"`) terpisah dari
   **"Galeri"** (`accept="image/*" multiple`), Dokumen, Tautan. Saat mengompres tampil status "Mengompres…".
   Target sentuh ≥44px di ponsel.
3. Unggah: paralel maks **2**, progres/status per bukti, tombol **"Coba lagi"** per bukti yang gagal,
   header `Idempotency-Key` per bukti (sudah didukung server: `up-${key}`). Logika antrean konkurensi murni +
   diuji (urutan, batas 2, gagal sebagian tidak menghentikan yang lain).
4. Draf form Tambah laporan disimpan di **IndexedDB** per perangkat (bukan server): kegiatan, deskripsi, PT,
   pelapor, jabatan, dan berkas bukti (Blob) — dipulihkan saat dashboard dibuka lagi; dihapus setelah laporan
   terkirim atau pengguna menekan "Buang draf". Kunci per id pengguna (akun admin dipakai bersama satu
   perangkat → satu draf per akun). Tanpa IndexedDB (mode privat) → diam-diam tanpa draf.
5. Input teks ≥16px di ponsel (Safari tidak memperbesar halaman).

## B — Thumbnail server
Zona: `prisma/schema.prisma` (model Evidence saja), `prisma/migrations/0036_bukti_thumbnail/`,
`src/app/api/evidence/upload/route.ts`, `src/app/api/evidence/signed/route.ts`, `src/lib/storage.ts`,
`src/lib/evidence-thumb.ts` (baru), `src/components/views/sh-overview/detail-logic.ts`,
`src/components/views/sh-overview/evidence.tsx`, `tests/api/evidence-thumb*.test.ts`,
`tests/api/sh-overview-signed.test.ts`, `tests/ui/sh-overview-detail.test.ts`.
1. Migrasi 0036 aditif: `Evidence.thumbKey String?`. SQL lewat `prisma migrate diff` (JANGAN `migrate dev`);
   `npx prisma generate`.
2. Unggah gambar (jpeg/png/webp/heic/gif): `sharp` (sudah terpasang) buat versi sisi terpanjang **320px WebP**
   (`rotate()` dulu untuk EXIF, kualitas ~70, target ≤30 KB), simpan di `${storageKey}.thumb.webp`, isi
   `thumbKey`. Gagal membuat thumbnail TIDAK menggagalkan unggahan (log saja). Hapus bukti → hapus thumb juga.
3. `POST /api/evidence/signed` menerima `{ ids, size?: 'thumb' | 'full' }` (bawaan `full`, kompatibel mundur).
   `thumb` → tanda tangan `thumbKey` bila ada, selain itu `storageKey`. Tautan (`url`) tak berubah.
   URL bertanda tangan untuk berkas memuat header cache privat sesuai TTL (mis. `response-cache-control`
   `private, max-age=300` bila driver mendukung; periksa `src/lib/storage.ts`).
4. Klien: `createSignedFetcher` dan `useSignedUrl(id, enabled, size)` memisahkan cache per (id, size);
   batch dikirim per size. Thumbnail kecil (`EvidenceThumb` size sm/stack/strip, `PhotoBox`, gambar kecil
   antrean Supervisor `QueueThumb` di `src/components/views/sh-review/body.tsx` — boleh diubah HANYA baris
   pemanggil `useSignedUrl`/`EvidenceFill` untuk meneruskan size) memakai `thumb`; lightbox & galeri besar `full`.
5. Tes: thumbnail dibuat & `thumbKey` terisi (mock storage), signed size thumb/full/fallback, klien batch per size.

## C — PWA, shell & tarik-muat-ulang
Zona: `public/manifest.webmanifest`, `public/sw.js`, `src/app/layout.tsx` (viewport saja),
`src/components/mk/pull-refresh.tsx` (baru), `src/components/mk/install-prompt.tsx` (baru),
`src/components/views/sh-review/phone.tsx` (hanya membungkus antrean dengan PullToRefresh),
`src/components/views/sh-overview/mobile/mobile-overview.tsx` (hanya membungkus), `tests/ui/pwa-*.test.ts`.
1. Manifest: deskripsi model subholding ("Laporan subholding PT BIKE Tbk: lapor, setujui, pantau"),
   pintasan **"Tambah laporan"** `/?tab=sh-dashboard` dan **"Persetujuan"** `/?tab=sh-review` (ganti pintasan lama),
   `theme_color` tetap.
2. Viewport: `interactiveWidget: 'resizes-content'` (keyboard tidak menutupi lembar/bilah menempel).
3. SW: naikkan versi (`mk-sw-v3`), aset `/_next/static/*` (berversi build, tak berubah) **cache-duluan**;
   ikon/logo tetap stale-while-revalidate; API tetap TIDAK pernah disimpan (kebijakan SW v2). Pertahankan
   CLEAR_CACHES dan fallback /luring.html.
4. `PullToRefresh({ onRefresh: () => Promise<void> | void, children })`: hanya aktif di layar sentuh saat
   halaman di puncak gulir (`window.scrollY === 0`); tarik dilacak dengan hambatan karet
   (`rubberband`), ambang ±72px memicu muat ulang, indikator putar kecil di atas isi, pegas kritis kembali;
   jangan ganggu gulir biasa (aktif hanya bila gerakan pertama ke bawah & vertikal). Logika murni
   (rubberband, keputusan picu) diuji. Pasang di antrean Supervisor ponsel (`s.reload`) dan dashboard
   Manajemen ponsel (`reload`). Integrator memasang di dashboard & kotak masuk Admin subholding.
5. `install-prompt.tsx`: `useInstallPrompt()` menangkap `beforeinstallprompt` (Android/Chrome) dan
   mendeteksi iOS Safari non-standalone; komponen `InstallPrompt` = kartu kecil sekali tampil
   ("Pasang Monitor Karya di layar utama" + tombol Pasang / petunjuk Bagikan → Tambah ke Layar Utama di iOS
   + Nanti). Sudah ditutup/terpasang → tidak muncul lagi (localStorage `mk:install-prompt`, akses dibungkus
   try/catch). Integrator memasangnya setelah laporan pertama Admin terkirim.
