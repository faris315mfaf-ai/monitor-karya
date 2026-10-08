# Braces 3.0.3 — patch lokal Monitor Karya

Mitigasi lokal untuk [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), berdasarkan paket npm resmi **braces 3.0.3**, lisensi MIT. Pada pemeriksaan 7 Oktober 2026 belum ada rilis upstream yang diperbaiki. Paket ini **bukan rilis resmi 3.0.4** dan tidak dipublikasikan ke registry.

## Isi dan asal

- `upstream/braces-3.0.3.tgz`: tarball resmi, SHA-512 di `provenance.json` cocok dengan `npm view braces@3.0.3 dist.integrity`.
- `package/`: sumber lengkap dari tarball, termasuk `LICENSE` dan README upstream, ditambah patch lokal. Versi lokal `3.0.3-mk.1`.
- `depth-guard.patch`: seluruh selisih sumber dari 3.0.3, termasuk metadata versi lokal. Tidak ada lifecycle script baru.
- `braces-3.0.3-mk.1.tgz`: tarball instalasi npm, dibangun dengan npm 11.19.1. Integrity disimpan pula di lockfile.
- `test/upstream/`: 12 berkas tes asli dari commit npm `74b2db2938fad48a2ea54a9c8bf27a37a62c350d`. Masing-masing memiliki SHA-256 di provenance. Diambil dari arsip commit resmi GitHub, tidak diubah.
- `verify.py`: validasi integritas, terapkan patch pada sumber bersih, bandingkan semua sumber, kemas ulang, dan buktikan tarball identik byte per byte. Python 3.12+, `patch`, npm 11.19.1 diperlukan. Tanpa jaringan.

## Perubahan perilaku yang disengaja

Parser membatasi kurung brace dan parentheses gabungan sampai **127 tingkat bersarang**, dengan satu tingkat cadangan untuk daun AST. Pola berlebih ditolak sebelum membangun struktur dalam atau menjalankan walker rekursif. Karakter di dalam kutipan, escape, dan kelas bracket tetap diperlakukan sesuai parser upstream, bukan dihitung dengan regex mentah.

Walker `compile`, `expand`, `stringify`, helper `append`, dan `flatten` memeriksa kedalaman sampai 128. Guard pada walker melindungi API yang menerima AST langsung. Pelanggaran menghasilkan `SyntaxError` berkode **`BRACES_MAX_DEPTH`**, bukan kehabisan call stack. Batas tidak dapat dimatikan atau dinaikkan oleh opsi masukan. Ini tetap galat yang harus ditangani pemanggil; bukan janji bahwa input tak tepercaya tidak pernah menghasilkan galat.

Perilaku di bawah batas tetap mengikuti upstream. Patch ini tidak mengatasi seluruh kemungkinan penggunaan CPU/memori ekspansi kombinatorial. Batas panjang 10.000 dan `rangeLimit` upstream tetap berlaku; jangan menjalankan pola dari jaringan/pengguna akhir sebagai glob lint.

## Instalasi dan pemeriksaan

Manifest akar memasang tarball sebagai devDependency `braces`, lalu `overrides["micromatch@4.0.8"].braces = "$braces"`. Referensi akar diperlukan agar npm menyelesaikan file relatif dari proyek, bukan dari direktori micromatch. Tidak ada patch postinstall atau ketergantungan pada pnpm.

Dari akar repo:

```sh
python3 vendor/braces/verify.py
npm run test:dependencies
node --stack-size=512 --test vendor/braces/test/*.test.cjs
```

794 tes lolos pada Node 26.8.2/macOS, termasuk seluruh suite upstream. Adapter tes memakai `node:test` untuk `describe`/`it`, mengabaikan impor registrasi Mocha, dan mengganti pencarian executable `bash-path` dengan Bash nyata `/bin/bash` (boleh diganti melalui `BASH_TEST_EXECUTABLE`). Assertion upstream, pola, dan hasil yang diharapkan tidak diubah. Tes diferensial membandingkan 213 pola × 6 opsi × 4 API dengan sumber npm asli; uji integrasi melewati resolver Next → fast-glob → micromatch → braces dan perilaku rootDir sebenarnya.

`npm run lint` tetap menjalankan ESLint seluruh proyek, dengan pengecualian khusus folder ini agar sumber CommonJS pihak ketiga tidak diubah hanya untuk memenuhi gaya TypeScript aplikasi. Tes patch berjalan melalui skrip tersendiri di atas.

CI menjalankan verifikasi reproduksi sebelum `npm ci`, lalu `npm run test:dependencies` setelah instalasi. Workflow mematok Python 3.12 dan npm 11.19.1. Sepuluh regresi tambahan ada di `tests/cx/braces-security.test.ts` dan ikut gerbang Vitest utama.

Dockerfile tahap deps sudah menyalin `vendor` sebelum `npm ci` (integrasi agen operasional). Hasil build/runtime Docker dilaporkan parent.

## Arti audit dan pemeliharaan

`npm audit` melaporkan 0 setelah override lokal. Itu tidak berarti database advisory mengesahkan patch ini: versi lokal/tarball tidak dikenali sebagai paket upstream terdampak oleh metadata registry. Bukti mitigasi berasal dari source diff, reproduksi crash sebelum patch, guard dan tes regresi setelah patch, bukan sekadar angka audit.

Tetap pantau advisory untuk **braces upstream 3.0.3**, termasuk cacat baru yang scanner mungkin tidak kaitkan dengan versi lokal. Bila rilis resmi aman tersedia: ganti/hapus override serta dependensi dev braces tambahan, hapus pengecualian lint vendor dan skrip tes khusus, perbarui lockfile, lalu ulangi uji glob/lint dan audit. Pertahankan versi Next/Prisma yang sesuai proyek.
