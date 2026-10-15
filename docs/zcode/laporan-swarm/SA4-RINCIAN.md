# SA4 — Pop-up rincian laporan & bukti (Opsi A, 15 Okt 2026)

Agen A4, branch `claude/subholding`. Kontrak: [KONTRAK-SUPERUSER-OPSI-A.md](../KONTRAK-SUPERUSER-OPSI-A.md).
Tidak ada commit, server, atau DB yang disentuh.

## Berkas

| Berkas | Status |
|---|---|
| `src/components/views/sh-overview/report-detail.tsx` | baru — `ReportDetail`, tipe `DetailReport` (sesuai kontrak) |
| `src/components/views/sh-overview/detail-logic.ts` | baru — logika murni + pengambil URL berkelompok |
| `src/components/views/sh-overview/evidence.tsx` | diubah — pengambil berkelompok, ukuran `stack`/`strip`, prop `className`/`pressed` |
| `tests/ui/sh-overview-detail.test.ts` | baru — 16 tes |

## `ReportDetail`

- Radix Dialog: fokus terkunci, Esc, klik latar, kunci gulir, fokus kembali ke pemicu.
  Saat dibuka fokus ke judul (`Dialog.Title` h2, `tabIndex=-1`), seperti `Sheet`.
- Konten diletakkan di dalam `Dialog.Overlay` (`mk-scrim` + `backdrop-blur-md`) supaya klik
  latar tetap "di luar" konten dan gulir dalam pop-up jalan.
- ≥600px: dialog tengah, lebar maks 760, `--radius-xl`, garis `--line`, `--shadow-sheet`.
  <600px: lembar bawah `100dvh - 48px`, sudut atas `--radius-xl`, pegangan `--fill-2`,
  ruang aman bawah `env(safe-area-inset-bottom)`.
- Foto besar 270 / 400 (tablet) / 380 (desktop) px, `object-cover`, kerangka selama URL dan
  gambar dimuat, ikon + "Foto belum bisa dimuat" bila gagal. Lencana `heroLabel` (kaca
  `--glass`). Klik → `onOpenPhoto(index)` (indeks di `photosOf`).
- Deretan thumbnail (hanya bila foto >1): `EvidenceThumb size="strip"`, `aria-pressed`,
  cincin `outline` 2px `--ink` (putih di tema gelap, gelap di tema terang) pada yang aktif.
- Chip subholding (inisial `initialOf`, warna `toneVars(tone)`) + chip PT; judul
  `--text-title-3` ponsel / `--text-title-2` ≥600; deskripsi `pre-line` sebagai
  `Dialog.Description`.
- "Dokumen" untuk `docsOf`: URL bertanda tangan disiapkan saat pop-up dibuka, baris menjadi
  `<a target="_blank" rel="noopener noreferrer">` (tidak `window.open` setelah `await`, jadi
  tidak diblok pemblokir pop-up). Label "Buka berkas" / "Buka tautan".
- Tanpa foto → tanpa blok foto; tombol Tutup pindah ke pojok kanan atas isi.
- Tombol Tutup 44×44, `aria-label="Tutup"`, kaca di atas foto.
- Isi dipasang ulang per `report.id` → pilihan foto kembali ke 0 saat laporan berganti
  (Content tetap terpasang, jadi fokus tidak terlempar).
- Animasi masuk via `@starting-style` (`motion-safe:starting:*`): ponsel geser dari bawah,
  ≥600 pudar + naik 16px, `--dur-slow` / `--ease-standard`. Tanpa animasi bila
  `prefers-reduced-motion: reduce`.
- Alt foto: "Foto bukti 1 dari 3: <kegiatan>"; tombol foto besar "Perbesar foto bukti 1 dari 3: …".

## `evidence.tsx`

- Ekspor & tanda tangan lama tetap: `useSignedUrl`, `EvidenceThumb`, `EvidenceLightbox`,
  `LightboxState` (sh-review tidak berubah; `size` bawaan tetap `md`).
- `EvidenceThumb`: `size` kini `'sm' | 'md' | 'stack' (64×64, --radius-md) | 'strip' (76×56)`,
  prop opsional `className` dan `pressed` (→ `aria-pressed`). Tipe `ThumbSize` diekspor.
- Pengambil URL: `createSignedFetcher` (detail-logic) dipakai satu instans modul.
  Permintaan dalam satu tick (`setTimeout 0`) → `POST /api/evidence/signed` `{ ids }`
  (≤60 per kiriman, dipecah bila lebih), header `Content-Type: application/json` (CSRF ditangani
  proxy lewat Origin — sama dengan pola `callJson`/sh-review). Cache TTL 270 dtk seperti
  sebelumnya; permintaan ganda berbagi satu janji. Id yang tidak kembali → gagal (tidak di-cache,
  dicoba lagi saat dipasang ulang). 404/405 → GET `/api/evidence/:id` per id dan diingat
  (kiriman berikutnya langsung GET). Jaringan gagal → GET per id untuk kiriman itu saja.
  Galat lain (401/403/422/503) → seluruh kiriman gagal tanpa GET.

## `detail-logic.ts` (diuji)

`clampIndex`, `photoAlt`, `docActionLabel`, `chunkIds`, `mergeSigned`, `batchUnsupported`,
`signedFromSingle`, `createSignedFetcher({ fetch, schedule?, now?, ttl?, max? })`,
konstanta `SIGNED_BATCH_MAX = 60`, `SIGNED_TTL_MS = 270000`.

## Verifikasi

- `npx vitest run tests/ui/sh-overview-detail.test.ts tests/ui/sh-review-logic.test.ts` — 2 berkas / 30 tes lulus;
  `npx vitest run tests/ui` — 12 berkas / 174 tes lulus.
- `npx eslint` berkas A4 — bersih.
- `npx tsc --noEmit --incremental false` — bersih (seluruh repo, termasuk berkas A1–A3 saat diperiksa).
- Kelas Tailwind varian (varian motion-safe/starting, kelas font sembarang bertoken judul) diperiksa
  lewat kompilasi `@tailwindcss/node` — keluar sebagai `@media (prefers-reduced-motion) { @starting-style {…} }`.

## Catatan untuk integrator

- Sudut dialog memakai `--radius-xl` (28px), bukan 34px mockup — tidak ada token 34.
- Latar redup memakai `--scrim` (0.32) + blur 12px, lebih terang dari mockup (0.62) — sesuai token.
- Ikon "perbesar" pada lencana berupa SVG sebaris (ikon `mk` tidak punya padanannya).
- Tidak ada gestur geser-tutup pada lembar ponsel; tutup lewat X, Esc, atau ketuk latar 48px atas.
- E2E yang disarankan: buka pop-up → Tab tetap di dalam → Esc → fokus kembali ke judul baris;
  lightbox dari foto besar tampil di atas pop-up dan Esc hanya menutup lightbox.
