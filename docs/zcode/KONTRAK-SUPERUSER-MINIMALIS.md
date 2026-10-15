# Kontrak dashboard Superuser & Manajemen — versi minimalis (15 Okt 2026)

Menggantikan tampilan Opsi A ([KONTRAK-SUPERUSER-OPSI-A.md](KONTRAK-SUPERUSER-OPSI-A.md) tetap
berlaku untuk hal yang tidak disebut di sini: API batch `POST /api/evidence/signed`, lightbox,
`displayName`/`subholdingLabel`/`toneOf`/`toneVars`, aturan desain/token).

Mockup pemilik: https://claude.ai/artifact/2vej4mKj3RD8v5QcFGXU9e halaman "Superuser — minimalis".
Salinan lokal (HTML statis, hex inline — terjemahkan ke token):
`/private/tmp/claude-501/-Users-godam-PROYEK-monitor-karya--claude-worktrees-zcode-memory-update-5805eb/29a79309-d79f-44fc-90fc-db202b16d574/scratchpad/artifact-files/0f96ceb7-6033-4bed-a223-2be50f51b661/project/Min-Desktop.dc.html`
(dan `Min-Ponsel.dc.html`, `Min-Rincian-Desktop.dc.html`, `Min-Rincian-Ponsel.dc.html` di folder yang sama).

## Layar (B3: `sh-overview-view.tsx`)
1. Kepala: konteks kecil `"<Peran> · <tanggal panjang>"`, judul "Laporan subholding" (lebih
   kecil dari sebelumnya, ±40px desktop / 30px ponsel), SegmentedControl Hari ini/Kemarin di kanan.
   TANPA sub-judul, TANPA baris pintasan chip.
2. Grid kartu: `grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr))`,
   `align-items: start`, gap 20 → 3 kolom bila muat, 2 kolom di layar sedang, 1 kolom di ponsel.
3. Kartu: `bg-surface`, radius besar (`--radius-xl`), padding 22/22/10, bayangan kartu
   (terang) / garis 1px `--line` (gelap). Kepala kartu satu baris: inisial bulat 30px
   (`toneVars`), nama `subholdingLabel` 17px semibold satu baris (ellipsis), kanan
   "5 laporan" (footnote, ink-2).
4. Subholding tanpa laporan: kartu yang sama, opacity ±0.6, teks "Belum ada laporan disetujui."
   setelah garis pemisah; diurutkan PALING AKHIR.
5. Isi kartu: per PT → garis pemisah 1px, nama PT (`displayName`, 12px ink-2, BUKAN huruf
   kapital), lalu baris laporan: tombol judul (15px medium, 1 baris ellipsis) + meta
   `"10.24 · Budi Santoso"` (12px ink-2; jam WIB `decidedAt`), kanan SATU thumbnail 44px radius 11
   (foto pertama) dengan lencana angka jumlah foto bila >1 → klik membuka lightbox foto 1.
   Tanpa foto → tanpa thumbnail. Baris min 52px; target sentuh ≥44px.
6. Klik judul → `ReportDetail` (B4). Muat/galat/kosong seperti sebelumnya.

## Pop-up rincian (B4: `report-detail.tsx`, `detail-logic.ts`)
- ≥600px: dialog tengah, lebar maks 1000, DUA kolom (`flex-wrap`): kiri foto (flex 1 1 440px:
  foto besar 4:3 + lencana "Foto 1 dari 3" + deretan thumbnail bila >1 foto), kanan info
  (flex 1 1 340px). Tanpa foto → hanya kolom info (lebar maks ±560).
  <600px: lembar dari bawah (tinggi 100dvh-48px), foto di atas, info di bawah.
- Info, berurutan: baris atas = inisial bulat + nama subholding (ink-2) dan tombol Tutup;
  judul h2 (±26px); daftar `<dl>` bergaris tipis:
  `PT pelaksana` → nama PT; `Pelapor` → nama + jabatan (baris kedua ink-2);
  `Disetujui` → `"10.24 · Kamis, 15 Okt 2026"` (WIB); `Bukti` → `"3 foto · 1 dokumen"`;
  lalu deskripsi (pre-line); lalu daftar dokumen (ikon + nama + "Buka", tab baru, URL bertanda
  tangan). Baris dl yang datanya kosong (mis. pelapor tidak ada) disembunyikan.
- Fokus/Esc/klik latar/kembali ke pemicu dan lightbox di atas pop-up tetap seperti sekarang.

## API (B1: `src/app/api/sh/overview/route.ts` + tipe di `logic.ts`)
Setiap laporan di `subholdings[].pts[].reports[]` mendapat (kompatibel mundur):
`reporterName: string`, `reporterTitle: string` (label jadi, mis. "Manajer Proyek" — pakai helper
yang sudah ada di `src/lib/subholding/*` yang juga dipakai ShReport), `decidedAt: string | null`
(ISO). `OverviewReport` di `logic.ts` ditambah field opsional yang sama (`reporterName?`,
`reporterTitle?`, `decidedAt?`) — B1 satu-satunya yang mengubah `logic.ts`.
B4 menambah di `detail-logic.ts`: `approvedLabel(iso)` → `"10.24 · Kamis, 15 Okt 2026"` dan
`timeLabel(iso)` → `"10.24"` (zona Asia/Jakarta, deterministik, iso null → ""), `buktiLabel(photos, docs)`.
B3 memakai `timeLabel` dari `detail-logic.ts`.

## Zona berkas (WAJIB)
| Agen | Berkas |
|---|---|
| B1 | `src/app/api/sh/overview/route.ts`, `src/components/views/sh-overview/logic.ts` (tipe saja), `tests/api/sh-overview-signed.test.ts`, `tests/api/sh-laporan.test.ts` (hanya bagian overview) |
| B3 | `src/components/views/sh-overview/sh-overview-view.tsx` |
| B4 | `src/components/views/sh-overview/report-detail.tsx`, `src/components/views/sh-overview/detail-logic.ts`, `tests/ui/sh-overview-detail.test.ts` |
Jangan commit, jangan jalankan server/DB. `evidence.tsx` jangan diubah kecuali B4 benar-benar perlu
(laporkan). Aturan desain: token/kelas bertoken saja; terang+gelap; Indonesia; tanpa emoji/tanda seru.
Catatan teknis: kelas `.t-*` menimpa `font-*`/`tracking-*` (shorthand `font:` di layer utilities) —
gunakan `[font:var(--text-…)]` atau `!` seperti di kode sekarang; JANGAN menulis pola kelas sembarang
yang memuat `*` di teks mana pun di repo (Tailwind memindai berkas).
