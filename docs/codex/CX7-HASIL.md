# CX7 — Hasil driver penyimpanan bukti

Selesai pada 6 Oktober 2026 di `/Users/godam/PROYEK/monitor-karya-codex`, cabang
`codex/kerja`, sesuai otorisasi pengguna yang membuka CX7. Supabase tetap default;
S3/MinIO hanya aktif ketika `STORAGE_DRIVER=s3`. Tidak ada perubahan `.env`,
dependensi, migrasi, commit, atau akses storage nyata.

## Berkas yang dikerjakan

- `src/lib/storage.ts`: pemilihan driver; ekspor lama, format key, konstanta,
  perilaku Supabase, dan TTL baca 300 detik tetap berlaku. Driver tidak valid
  menghasilkan `storageConfigured() === false`; operasi menolak tanpa fallback.
- `src/lib/storage-s3.ts`: konfigurasi endpoint/region/bucket/key/secret/path style,
  SigV4 Node bawaan, GET presigned privat, unggah tanpa overwrite melalui header
  `If-None-Match: *` bertanda tangan, DELETE dengan toleransi 404. HTTP mutasi
  memakai `redirect: 'error'`, `cache: 'no-store'`, timeout 30 detik.
- `tests/cx/storage.test.ts`: 40 tes offline; seluruh fetch dan klien Supabase
  dimock. Vektor golden AWS bukan dihitung dengan implementasi yang sedang dites.
- `docs/codex/penyimpanan.md`: konfigurasi dan batas dukungan, izin bucket privat,
  akses endpoint oleh server/browser, serta prosedur peralihan objek.
- `docs/codex/CX7-HASIL.md`: catatan hasil ini.

## Pemeriksaan

| Pemeriksaan | Hasil |
|---|---|
| `npx vitest run tests/cx/storage.test.ts` | 40 tes lolos. |
| `npx vitest run` | 41 berkas, 765 tes lolos pada pemeriksaan terakhir; mencakup pekerjaan agen lain yang sedang berjalan. |
| `npx tsc --noEmit --incremental false` | Lolos tanpa galat. |
| `npx eslint src` | Lolos tanpa galat. |
| `npx eslint src/lib/storage.ts src/lib/storage-s3.ts tests/cx/storage.test.ts` | Lolos setelah tambahan tes final. |
| `git diff --check` | Lolos. |

Vektor GET AWS memakai timestamp `20130524T000000Z`, `examplebucket/test.txt`,
TTL 86400 detik, dan kredensial contoh publik; signature persis
`aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404` dari
[dokumentasi primer AWS](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-query-string-auth.html).
Facade aplikasi selalu memberi TTL 300 detik. Tes juga memeriksa query mentah
agar encoding UTF-8, `%20`, dan nested percent encoding untuk nama unduhan tetap
utuh, serta memverifikasi ulang tanda tangan PUT/DELETE dari permintaan aktual.

Panduan Next.js bundel dibaca sebelum kode: environment variables, runtime route
segment, dan batas server/client (`server-only`). Pemeriksaan graph Tier 2 memakai
snapshot parent `2026-10-06T07:13:10Z`; cakupan sumber storage dan route evidence
upload tidak mencatat gap. Sumber aktual juga dibaca langsung. Sinyal coverage ini
best-effort, bukan bukti bahwa seluruh graph lengkap. Graph tidak dimutasi.

## Batas verifikasi dan tindak lanjut integrasi

- Subagen menjalankan tes offline; agen induk kemudian menguji MinIO lokal hidup.
  Hasilnya tercatat di bagian uji integrasi di bawah.
- Bucket privat dan dukungan conditional PUT harus disediakan operator. Modul
  tidak membuat bucket, mengubah ACL, atau memindahkan objek Supabase lama.
- Pemilihan driver bersifat global. Key lama kompatibel, tetapi objek harus
  tersedia di penyedia yang dipilih; salin dan verifikasi sebelum peralihan.
- Endpoint adalah origin tanpa prefix path. Dukungan terbatas pada kredensial
  statis dan bucket S3 biasa; STS/session token, bucket directory/Access Point,
  multipart upload, serta rantai kredensial AWS otomatis belum didukung.
- Pesan konfigurasi 503 pada route unggahan lama masih menyebut Supabase; route
  tersebut berada di luar zona CX7. Perilaku tetap gagal tertutup untuk konfigurasi
  S3 tidak valid; penyempurnaan pesannya dapat dilakukan pemilik route.
- Tidak menjalankan build produksi atau pengujian storage hidup di subtask ini.
  Perubahan agen lain tetap dipertahankan, tidak dikembalikan atau di-commit.

## Uji integrasi oleh agen induk

MinIO lokal terpisah pada loopback 19000: unggah nama Unicode, baca presigned GET dengan nama unduhan, penolakan overwrite, hapus, hapus ulang dan GET 404 semuanya lolos. Container tidak memakai layanan SIMRS MinIO atau kredensial nyata. Supabase tidak dipanggil.

CSP produksi perlu perubahan lintas zona di security-headers.ts sebelum preview gambar S3 di dalam aplikasi bisa dipakai. Permintaan dicatat di PEMBAGIAN-TUGAS; driver backend dan buka URL unduhan langsung sudah teruji.

## Pembaruan integrasi lanjutan

Tindak lanjut lintas zona dalam laporan awal telah diterapkan di cabang Codex atas permintaan pengguna. Hasil browser, jumlah tes terbaru dan gambar ada di [README](README.md#integrasi-lanjutan). Catatan awal di atas merupakan riwayat sebelum integrasi.
