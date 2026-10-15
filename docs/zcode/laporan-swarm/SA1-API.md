# SA1 — API dashboard Superuser Opsi A (15 Okt 2026)

Agen A1, branch `claude/subholding` (basis `9a9fc67`). Kontrak:
[KONTRAK-SUPERUSER-OPSI-A.md](../KONTRAK-SUPERUSER-OPSI-A.md). Belum di-commit.

## Dibuat / diubah

| Berkas | Perubahan |
|---|---|
| `src/app/api/evidence/signed/route.ts` (baru) | `POST` batch URL bukti, `runtime = 'nodejs'` |
| `src/app/api/sh/overview/route.ts` | evidence + `kind: 'file' \| 'link'`; urutan nama ditegaskan di JS |
| `tests/api/sh-overview-signed.test.ts` (baru) | 10 tes |
| `tests/api/sh-laporan.test.ts` | 1 baris: harapan evidence overview kini memuat `kind: 'file'` (`toEqual` ketat) |

## POST /api/evidence/signed

- `requireApiUser({ allowSubholdingRoles: true })` → 401 tanpa sesi.
- Body bukan JSON / bukan objek → 400 `{ error }`. `ids` bukan larik, kosong, >60, ada ganda,
  bukan string, string kosong atau >128 karakter → 422 `{ error }`.
- Satu `db.evidence.findMany({ id: { in: ids } })`; `canReadEvidence` dipanggil sekali per induk
  unik (`targetType:targetId`), paralel.
- Id tidak ada / ditolak / tautan tidak aman (`safeEvidenceUrl` null) / gagal tanda tangan →
  dilewati diam-diam (gagal tanda tangan dicatat `console.error`). Respons selalu 200 bila lolos
  validasi: `{ items: [{ id, url, kind }], expiresInSeconds: 300 }`, urutan mengikuti `ids`.
- 503 `{ error, needsConfig: true }` bila penyimpanan belum aktif **dan** ada berkas (bukan tautan)
  yang boleh dibaca. Keputusan: hanya-tautan tetap 200; berkas di luar cakupan tidak memicu 503
  (supaya keberadaannya tidak bocor).
- Galat DB → 500 umum lewat `serverError`.
- Konstanta batas tidak diekspor dari `route.ts` (Next menolak ekspor non-rute).

## GET /api/sh/overview

- Tiap evidence: `{ id, fileName, mime, kind }`, `kind = 'link'` bila kolom `url` terisi. URL
  tautan TIDAK dikirim (tetap lewat endpoint bertanda tangan).
- Urutan: subholding dan PT diurutkan `localeCompare(..., 'id')` di JS (subholding sebelumnya
  hanya `orderBy` DB); laporan tetap `orderBy [decidedAt asc, submittedAt asc]`.
- Field lain tidak berubah (kompatibel mundur).

## Hasil verifikasi

- `npx vitest run tests/api/sh-overview-signed.test.ts tests/api/sh-laporan.test.ts` → 2 berkas,
  43 tes lulus (10 baru + 33 lama).
- `npx eslint` berkas zona A1 → bersih.
- `npx tsc --noEmit --incremental false` → hanya 2 galat di luar zona:
  `src/components/views/sh-overview/sh-overview-view.tsx` mengimpor `defaultOpen`/`summaryLabel`
  yang sudah dihapus A2 dari `logic.ts` (akan hilang setelah A3 selesai).
