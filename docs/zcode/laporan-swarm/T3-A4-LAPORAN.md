# T3-A4 — Mock pratinjau dan QA (laporan parent)

Agen T3-A4 kehilangan koneksi ke API model di tengah tugas (DNS `api.z.ai` tidak terjangkau, 8 Okt 2026 ±14.00 WIB) dan tidak sempat menulis laporannya. Laporan ini disusun parent setelah memverifikasi sisa pekerjaannya di pohon kerja. Seluruh kredibilitas angka di bawah berasal dari verifikasi parent, bukan klaim agen.

## Temuan pekerjaan A4 di pohon kerja (diterima setelah verifikasi)

- `src/components/preview/mock-proyek.ts` — proyek contoh drill-down: `SIM RS` (SPK-PRJ-01), `MEDCREATIX` (SPK-PRJ-02), `MEDPAY` (SPK-PRJ-03), seluruhnya `entityId 'e4'`, dengan PIC berbeda; ditandai `[T3-A4]`.
- `src/components/preview/mock-catalog.ts` — katalog/entitas contoh PT untuk pengelompokan (komentar `[T3-A4]`).
- `src/components/preview/mock-summary.ts` — `/api/ringkasan` tiruan kini menyuntikkan `escalations` per proyek (`projectEscalations`) dan mengikat proyek contoh di atas.
- `src/components/preview/mock-admin.ts` — arsip `/api/daily-reports` dengan dukungan parameter `projectId`/`pageSize` (`dailyReportsRoute`) beserta data beragam status; handler terdaftar pada rute GET.
- `tests/cx/cx11-preview.test.ts` — disesuaikan (kartu terhapus tidak lagi diasertkan; data baru diuji).

## Verifikasi parent

- `npx vitest run tests/cx/cx11-preview.test.ts tests/ui tests/api` → 35 berkas / **731 tes lulus** (setelah perbaikan integrasi parent di cx15, lihat HASIL-TAHAP3).
- `tsc --noEmit --incremental false` → nol galat; `eslint src/components/preview` → lulus.
- Pratinjau runtime (server dev 3200, hot-reload) memuat bagian "Laporan per perusahaan" dan kartu lama hilang — rincian di HASIL-TAHAP3 bagian verifikasi visual.

## Batasan

- QA markup dilakukan parent lewat SSR/curl + peramban; agen A4 tidak sempat menjalankan QA-nya sendiri.
- Data mock dibatasi 8–14 item laporan pada proyek contoh; kasus tepi (sheet error/retry) di pratinjau mengikuti perilaku mock umum.
