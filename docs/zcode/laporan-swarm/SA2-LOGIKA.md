# SA2 — Logika murni dashboard Superuser (kontrak opsi A)

Zona: `src/components/views/sh-overview/logic.ts`, `tests/ui/sh-overview-logic.test.ts`.

## Perubahan
- `OverviewEvidence` + `kind?: 'file' | 'link'`.
- Fungsi baru: `toneOf`, `toneVars`, `displayName`, `subholdingLabel`, `cardMeta`,
  `splitSubholdings`, `photosOf`, `docsOf`, `thumbStack`, `anchorId`, `heroLabel` (+ tipe `Tone`).
- Dihapus: `defaultOpen`, `summaryLabel` (hanya dipakai `sh-overview-view.tsx` versi lama; tesnya
  diganti tes `cardMeta`). Ekspor lain tetap (`isImageMime`, `stepIndex`, `positionLabel`,
  `keyDelta`, `wibDateKey`, `dateFromKey`, `normalizePts`, `groupByPt`, `initialOf`, tipe `Overview*`, `FlatReport`).

## Keputusan kecil
- Tautan lama (`kind: 'link'`) tidak dianggap foto walau mime gambar → masuk `docsOf`
  (alamat luar, tidak lewat URL bertanda tangan/CSP).
- `displayName`: rangkaian huruf/angka dikapitalisasi per segmen (batas: spasi, `-`, `/`, `.`, kurung);
  apostrof tetap di dalam kata (`JUM'AT` → `Jum'at`). Singkatan tetap: PT, CV, UD, BUMN, BUMD;
  `TBK`→`Tbk`, `PERSERO`→`Persero`. Romawi I–XXXIX saja (hindari kata "DI", "MI").
- `subholdingLabel` juga membuang awalan `Sub-holding ` (sejalan `initialOf`).
- `cardMeta`: laporan = max(`sh.count`, isi PT); PT = PT berlaporan dari rincian, fallback
  `sh.ptCount` bila rincian kosong; tanpa PT sama sekali → `"n laporan"`.
- `toneOf`: FNV-1a 32-bit atas unit UTF-16, `% 6 + 1`.

## Verifikasi
- `npx vitest run tests/ui/sh-overview-logic.test.ts` — 47 tes lulus.
- `npx eslint` dua berkas — bersih.
- `tsc` — hanya 2 galat di `sh-overview-view.tsx` (impor `defaultOpen`/`summaryLabel`), zona A3
  yang sedang ditulis ulang.
