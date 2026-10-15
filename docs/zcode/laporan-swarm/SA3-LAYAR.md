# SA3 — Layar dashboard Superuser & Manajemen (Opsi A "Mosaik")

Tanggal: 15 Okt 2026 · Branch `claude/subholding` · Zona: `src/components/views/sh-overview/sh-overview-view.tsx`
Kontrak: [KONTRAK-SUPERUSER-OPSI-A.md](../KONTRAK-SUPERUSER-OPSI-A.md) bagian "Perilaku layar".

## Yang dikerjakan

`ShOverviewView` ditulis ulang dari akordeon menjadi Opsi A "Mosaik":

1. **Kepala** — konteks `"<ROLE_LABELS[user.role]> · <tanggal panjang>"`, judul h1 "Laporan subholding",
   sub "Hanya laporan yang sudah disetujui supervisor.", kanan `SegmentedControl` Hari ini / Kemarin
   (kelas `mk-pagehead*`). Ganti hari menutup pop-up dan lightbox.
2. **Nav pintasan** `nav[aria-label="Lompat ke subholding"]` — chip `<a href="#sh-<id>">` per subholding
   (berisi dulu, lalu kosong): inisial bernada (`toneVars(toneOf(id))`), nama (`subholdingLabel`,
   disembunyikan visual <600, tetap di `aria-label`), jumlah laporan. Klik: `scrollIntoView` halus
   (instan bila `prefers-reduced-motion: reduce`) lalu fokus ke judul kartu (`h2 tabIndex=-1`,
   `preventScroll`). Chip subholding kosong melompat ke baris "Belum ada laporan disetujui".
   ≥1024 membungkus; <1024 bergulir horizontal. Tinggi chip 44px.
3. **Kartu** `section#sh-<id>[aria-labelledby]` — semua terbuka; ≥1024 `lg:columns-2` + `break-inside-avoid`,
   <1024 satu kolom. Inisial 56px (44px ponsel) latar nada 18%, eyebrow "SUBHOLDING" (tersembunyi di
   ponsel), nama `subholdingLabel`, meta `cardMeta`. `scroll-mt` menyesuaikan tab bar tablet.
4. **Grup PT** — h3 titik nada + `displayName(pt.name)` huruf kapital kecil; panel `bg-fill-1`
   `rounded-[var(--radius-lg)]`, pemisah 1px `var(--line)` antarbaris.
5. **Baris laporan** — tombol judul (`t-body-strong`, garis bawah saat hover) + deskripsi `line-clamp-2`
   (+ keterangan "n dokumen" bila ada bukti non-gambar); tumpukan `thumbStack(evidence, 3)` memakai
   `EvidenceThumb size="stack"` dengan overlap `-ml-[18px]` dan cincin 3px warna panel (`--fill-1`),
   tombol "+n" (`aria-label="Lihat semua n foto"`) membuka lightbox indeks 3. Label foto
   "Perbesar foto n dari m". Ponsel (<600): thumbnail di bawah teks, berjarak, tanpa tumpuk/cincin.
6. **Belum melapor** — satu `section` bergaris putus (`--line-strong` 55%) "Belum ada laporan disetujui"
   + chip per subholding dari `splitSubholdings().empty`.
7. **Status** — skeleton (chip + 4 blok masonry), `ErrorNote` + Coba lagi, `EmptyNote` "Belum ada
   subholding aktif." Bila semua subholding kosong: `EmptyNote` "Belum ada laporan yang disetujui pada
   tanggal ini." + baris belum melapor. Muat ulang saat ganti hari: isi lama `opacity-60` + `aria-busy`.
8. **Pop-up & lightbox** — judul → `ReportDetail` (A4) dengan `DetailReport` (`ptName` = `displayName`,
   `subholdingName` = `subholdingLabel`, `tone` = `toneOf(sh.id)`); `onOpenPhoto(i)` →
   `setLightbox({ items: photosOf(evidence), index: i, title: kegiatan })`. Thumbnail baris → lightbox
   pada foto itu. `EvidenceLightbox` dirender setelah `ReportDetail` sehingga tampil di atasnya; menutup
   lightbox kembali ke pop-up (Radix mengembalikan fokus ke pemicu).

## Catatan teknis penting

- **Kelas `t-*` mengalahkan utilitas Tailwind biasa.** `.t-callout`, `.t-caption`, dst. ada di
  `@layer utilities` *setelah* utilitas Tailwind, dengan `font:` shorthand. Akibatnya `t-caption font-bold`
  atau `t-caption tracking-[...]` **tidak berlaku** (diverifikasi dengan kompilasi `@tailwindcss/node`).
  Di layar ini dipakai `font-bold!` / `tracking-[0.08em]!` (important v4) atau `[font:var(--text-…)]`
  untuk ukuran responsif. Layar lama di repo yang memakai pola `t-* font-*` kemungkinan terkena hal yang sama.
- `t-*` juga tidak bisa diberi varian (`min-[600px]:t-title-3` tidak dihasilkan) karena bukan `@utility`.
- `.mk-*` dari `design-system/components/bundle.css` tidak berlapis sehingga menang atas utilitas;
  kartu dibangun dari utilitas bertoken (bukan `mk-card` + override).

## Verifikasi

```
export DATABASE_URL='postgresql://x:y@127.0.0.1:1/db' DIRECT_URL='postgresql://x:y@127.0.0.1:1/db'
npx eslint src/components/views/sh-overview/   → bersih
npx tsc --noEmit --incremental false            → bersih (setelah report-detail.tsx A4 ada)
```

Belum diuji di peramban (larangan menjalankan server) — integrator perlu cek visual terang/gelap,
desktop/tablet/ponsel, dan alur pop-up → lightbox → tutup.

## Ketergantungan

- A2 `logic.ts`: `anchorId, cardMeta, displayName, docsOf, photosOf, splitSubholdings, subholdingLabel,
  thumbStack, toneOf, toneVars, Tone`, serta `initialOf` lama (dipakai untuk huruf inisial dari
  `subholdingLabel`). `defaultOpen`/`summaryLabel` tidak dipakai lagi.
- A4: `ReportDetail`, `DetailReport`, `EvidenceThumb` (`size="stack"`, `className`), `EvidenceLightbox`.
