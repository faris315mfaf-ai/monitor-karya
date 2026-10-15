# Kontrak dashboard Superuser & Manajemen — Opsi A "Mosaik" (15 Okt 2026)

Mockup yang dipilih pemilik: https://claude.ai/artifact/2vej4mKj3RD8v5QcFGXU9e halaman
"Superuser — 3 opsi", papan **A · Mosaik** (desktop/tablet/ponsel) dan **A · Laporan diklik —
pop-up rincian** (desktop/tablet/ponsel). Berlaku untuk peran `SUPERUSER` dan `MANAJEMEN`
(tab `sh-overview`); Supervisor/Superadmin juga boleh membuka API-nya.

Basis kode: branch `claude/subholding`, HEAD `9a9fc67`. Kontrak model subholding tetap
berlaku: [KONTRAK-SUBHOLDING-16-OKT.md](KONTRAK-SUBHOLDING-16-OKT.md).

## Perilaku layar (mockup Opsi A)

1. Kepala: konteks `"<Peran> · <tanggal panjang>"`, judul **"Laporan subholding"**, sub
   "Hanya laporan yang sudah disetujui supervisor." Kanan: SegmentedControl Hari ini / Kemarin.
2. Baris pintasan (nav "Lompat ke subholding"): chip per subholding = inisial berwarna + nama +
   jumlah laporan; klik → gulir ke kartunya (`#sh-<id>`), fokus ke judul kartu.
3. **Semua kartu subholding yang punya laporan TERBUKA** (tanpa akordeon). Desktop ≥1024:
   2 kolom gaya masonry (CSS `columns`, kartu `break-inside: avoid`); <1024: 1 kolom.
4. Kartu: inisial 56px (warna nada subholding, latar nada 18%), eyebrow "SUBHOLDING", nama
   (tanpa awalan "Subholding"), meta "3 laporan · 2 PT".
5. Dalam kartu: grup per PT (titik warna + nama PT huruf kapital kecil), lalu daftar laporan
   dalam panel bergaris pemisah 1px. Baris laporan = tombol judul (judul tebal + deskripsi 2 baris
   terpotong) + tumpukan thumbnail foto (maks 3 bertumpuk, lalu tombol "+n"). Ponsel: thumbnail
   di bawah teks, tidak bertumpuk.
6. Subholding tanpa laporan disetujui: SATU baris garis putus-putus di bawah, "Belum ada laporan
   disetujui" + chip per subholding.
7. Klik judul laporan → **pop-up rincian** (lihat bawah). Klik thumbnail → **lightbox** langsung
   pada foto itu. "+n" → lightbox mulai foto ke-4.
8. Muat: skeleton; galat: ErrorNote + Coba lagi; tidak ada subholding aktif: EmptyNote.
9. Tanpa angka KPI. Nama entitas yang diketik HURUF BESAR SEMUA ditampilkan rapi (title case),
   lihat `displayName`.

## Pop-up rincian laporan

- Desktop/tablet (≥600): dialog di tengah, lebar maks 760, sudut 34, latar redup + blur.
  Ponsel (<600): lembar dari bawah setinggi layar dikurangi 48px, pegangan di atas.
- Isi berurutan: foto besar (tinggi 380 desktop / 400 tablet / 270 ponsel) dengan lencana
  "Foto 1 dari 3" (ikon perbesar) → klik membuka lightbox pada foto itu; deretan thumbnail
  (pilih → ganti foto besar, `aria-pressed`, cincin putih pada yang aktif); chip subholding
  (inisial berwarna + nama) dan chip PT; judul (h2); deskripsi utuh (`white-space: pre-line`).
- Bukti non-gambar (dokumen/tautan) tampil sebagai daftar "Dokumen" di bawah deskripsi,
  tombol membuka URL bertanda tangan di tab baru. Laporan tanpa foto: tanpa blok foto besar.
- Tutup: tombol X (kanan atas, di atas foto), Esc, klik latar. Fokus kembali ke pemicu.
- Tanpa status/komentar/pelapor (keputusan pemilik: hanya judul + deskripsi + bukti).

## Zona berkas (WAJIB — jangan sentuh berkas zona lain)

| Agen | Berkas milik |
|---|---|
| A1 API | `src/app/api/evidence/signed/route.ts` (baru), `src/app/api/sh/overview/route.ts`, `tests/api/sh-overview-signed.test.ts` (baru) |
| A2 Logika | `src/components/views/sh-overview/logic.ts`, `tests/ui/sh-overview-logic.test.ts` |
| A3 Layar | `src/components/views/sh-overview/sh-overview-view.tsx` |
| A4 Rincian | `src/components/views/sh-overview/report-detail.tsx` (baru), `src/components/views/sh-overview/evidence.tsx`, `tests/ui/sh-overview-detail.test.ts` (baru) |

Integrator (Claude utama): `app-shell.tsx`, gerbang penuh, E2E, commit. Jangan commit,
jangan jalankan server, jangan sentuh DB/produksi.

## Antarmuka bersama

### A1 — `POST /api/evidence/signed` (baru)
Body `{ ids: string[] }` (1–60 id unik; lebih → 422). `requireApiUser({ allowSubholdingRoles: true })`.
Untuk tiap id: cari Evidence, `canReadEvidence(user, targetType, targetId)` — id yang tidak ada
atau ditolak TIDAK dibocorkan alasannya, cukup dilewati. Balasan
`{ items: [{ id, url, kind: 'file'|'link' }] }` (tautan lama lewat `safeEvidenceUrl`, berkas lewat
`signedEvidenceUrl`; satu gagal tanda tangan → dilewati, bukan 500). Penyimpanan belum aktif →
503 seperti GET tunggal. Origin/CSRF ditangani proxy.

### A1 — `GET /api/sh/overview` (perluasan, kompatibel mundur)
Setiap `evidence` item mendapat `kind: 'file' | 'link'` (link = baris dengan `url`). Urutan:
subholding menurut nama, PT menurut nama, laporan menurut `decidedAt` lalu `submittedAt`.
`ptCount` = PT yang punya laporan disetujui (sudah). Field lain tidak berubah.

### A2 — `logic.ts` (tambahan; ekspor lama yang dipakai `evidence.tsx` tetap ada:
`isImageMime`, `stepIndex`, `positionLabel`, `keyDelta`, `wibDateKey`, `dateFromKey`,
`normalizePts`, `groupByPt`, tipe `Overview*`)
- `OverviewEvidence` menjadi `{ id: string; fileName: string; mime: string | null; kind?: 'file' | 'link' }`.
- `toneOf(id: string): 1|2|3|4|5|6` — hash stabil id → nada; warna = token `--data-<n>`.
- `toneVars(tone)` → `{ fg: 'var(--data-n)', bg: 'color-mix(in srgb, var(--data-n) 18%, transparent)' }`.
- `displayName(name: string): string` — bila nama berisi huruf dan seluruh hurufnya kapital →
  title case per kata; singkatan dipertahankan: `PT`, `CV`, `TBK`→`Tbk`, `PERSERO`→`Persero`,
  kata ≤3 huruf tanpa vokal tetap kapital; nama campuran dibiarkan.
- `subholdingLabel(name)` — `displayName` tanpa awalan "Subholding " (tak peka huruf).
- `cardMeta(sh)` — `"3 laporan · 2 PT"`; kosong → `"Belum ada laporan disetujui"`.
- `splitSubholdings(list)` → `{ filled, empty }` (urutan masuk dipertahankan).
- `photosOf(evidence)` (gambar saja) dan `docsOf(evidence)` (bukan gambar).
- `thumbStack(evidence, max = 3)` → `{ shown: OverviewEvidence[], more: number }` (hanya gambar).
- `anchorId(id)` → `"sh-" + id`.
- `heroLabel(index, length)` → `"Foto 1 dari 3"`.
Hapus `defaultOpen`/`summaryLabel` bila tak terpakai lagi (A3 tidak memakainya).

### A4 — `report-detail.tsx`
```ts
export type DetailReport = {
  id: string; kegiatan: string; deskripsi: string
  ptName: string; subholdingName: string; tone: 1|2|3|4|5|6
  evidence: OverviewEvidence[]
}
export function ReportDetail(props: {
  report: DetailReport | null          // null = tertutup
  onClose: () => void
  onOpenPhoto: (photoIndex: number) => void   // indeks dalam photosOf(evidence)
}): JSX.Element
```
`evidence.tsx` tetap mengekspor `useSignedUrl`, `EvidenceThumb`, `EvidenceLightbox`,
`LightboxState` dengan tanda tangan kompatibel (dipakai juga `sh-review`). A4 boleh:
menambah prop opsional `EvidenceThumb` (`size: 'sm' | 'md' | 'stack' | 'strip'`, `className`),
dan membuat pengambil URL mengelompokkan permintaan dalam satu tick ke
`POST /api/evidence/signed` (fallback ke `GET /api/evidence/:id` bila 404/405).

### A3 — layar
Memakai `ReportDetail` (A4), `EvidenceThumb`/`EvidenceLightbox` (A4), fungsi A2. Lightbox dari
pop-up: `onOpenPhoto(i)` → `setLightbox({ items: photosOf(r.evidence), index: i, title })`.
Lightbox dari thumbnail baris: `items` = `photosOf(r.evidence)`.

## Aturan desain
Nilai visual HANYA dari `design-system/tokens.css` / kelas Tailwind bertoken (`bg-surface`,
`text-ink-2`, `var(--line)`, `var(--radius-lg)`, `var(--data-n)` …), komponen `src/components/mk`.
Tema terang+gelap wajib benar. Bahasa Indonesia, sentence case, tanpa emoji/tanda seru. Target
sentuh ≥44px. `prefers-reduced-motion` dihormati. Next.js 16.3.8 — baca
`node_modules/next/dist/docs/` bila menyentuh rute (params = Promise).
