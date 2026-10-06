# CX 11 — Data contoh pratinjau

Data contoh ditata melalui katalog dan pembantu ringkasan/riwayat bersama.
Cakupan pencarian, tanggal WIB, alur buka kunci, serta status baca/revisi menjadi
sasaran suite pratinjau. Fixture tanpa PIC dan lajur beku kosong dipertahankan,
sehingga kasus kosong tidak disembunyikan demi kelulusan tes.

Berkas: `src/components/preview/mock-{catalog,api,history,summary}.ts`,
`mock-data.ts`, `mock-admin.ts`, `mock-group.ts`, `mock-kadiv.ts`, `mock-laporan.ts`,
`mock-oversight.ts`, `mock-pic.ts`, `mock-proyek.ts`, `mock-sistem.ts`,
`preview-app.tsx`; tes `tests/cx/cx11-preview.test.ts` dan
`tests/cx/preview-integration.test.ts`.

Worker: **12 tes baseline gagal → 31 tes lolos**. Kegagalan integrasi lajur
beku kosong sudah tercakup oleh **63 berkas/1.192 tes lolos**. Source CX 11 pukul 21.51.05 sudah tercakup oleh build runner final
`monitor-karya:cx-final` yang lolos.

Bukti cari Rina pada Admin ada di CX 15; screenshot tunggal tersebut tidak
disamakan dengan pembuktian visual semua peran. Build final lolos; gambar final responsif ditampilkan pada CX 10.

Bukti integrasi bersama dan versi runtime: [hasil CX 8–15](CX8–15-HASIL.md).
Riwayat pemeriksaan: [lampiran lanjutan](LANJUTAN-POIN1-7-DAN-CX8-15.md).
