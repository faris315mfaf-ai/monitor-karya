# T11-INFRA — Sisa temuan infrastruktur T10-AUD4

## Diperbaiki
- `public/luring.html` [RENDAH]: skrip inline dan `onclick` dihapus (diblokir CSP produksi nonce + strict-dynamic; berkas JS eksternal juga tidak membantu karena `'self'` diabaikan oleh `strict-dynamic`). Tombol menjadi tautan biasa `<a href="/">`. Teks "Terakhir memeriksa koneksi" dan pendengar `online` dibuang (memang mati di produksi). Salinan teks diluruskan: halaman HTML tidak pernah di-cache SW, jadi klaim "halaman yang pernah dibuka bisa dibaca" salah.
- `public/sw.js` [bug baru]: setelah pesan `CLEAR_CACHES` (logout) semua cache dihapus termasuk `/luring.html`, sehingga fallback luring hilang sampai SW dipasang ulang. Kini aset PRA_CACHE (tanpa data pengguna) dipasang ulang setelah pembersihan. Komentar header diluruskan (tidak ada "cache halaman").
- `.github/workflows/{ci,android}.yml` [RENDAH]: semua Actions dipin ke SHA commit, dari GitHub API terautentikasi (`gh api .../git/ref/tags/<tag>`, tag anotasi dideref): checkout 11d5960a (v4.4.0), setup-node 49933ea5 (v4.4.0), setup-python ece7cb06 (v6.3.0), setup-java cf277c60 (v4.9.1), gradle setup-gradle ed408507 (v4.4.3), upload-artifact ea165f8d (v4.6.2). Komentar versi ditambahkan; Dependabot/Renovate dapat memutakhirkan.
- `src/lib/security.ts` [RENDAH]: komentar `clientIp()` tidak sesuai template Caddy (menulis "menambahkan XFF", padahal template menimpa). Diluruskan dan syarat wajib proxy dinyatakan eksplisit. Perilaku tidak diubah.

## Dilewati (alasan)
- `x-real-ip` dipercaya: pada deployment terdokumentasi (Caddy menimpa, Vercel mengisi) aman; mengubah prioritas header berisiko merusak atribusi IP di Vercel. Tidak ada cara andal membedakan proxy tepercaya di aplikasi. Mitigasi = dokumentasi syarat proxy (sudah ditambah).
- Opsi pembatasan PR fork di workflow: kebijakan, bukan bug; tidak diubah.
- Sudah diperbaiki di T10-FIX3: S1 (PII cache SW), S2 (batas 1 MB proxy), S3 (guard superadmin).
- Di luar kepemilikan berkas (api/lib lain): clientIp di logout/evidence DELETE, scrypt, Math.random storage key, tautan bukti warisan.
- INFO: email ACME `admin@contoh.id` di `deploy/app-vps/proxy/Caddyfile` adalah placeholder yang harus diisi operator; bukan bug kode.
- Sapuan baru `proxy.ts`, `next.config.ts`, `Dockerfile`, `deploy/*`, `scripts/*`: `bash -n` semua skrip lolos; shellcheck (warning+) hanya SC2164 gaya di `vercel-secrets.sh`. Tidak ada bug nyata lain.

## Verifikasi
`tsc --noEmit` bersih; `eslint src/lib/security.ts` bersih; `node --check public/sw.js` ok; vitest `tests/api/proxy.test.ts` + `tests/security/s2-rate-limit.test.ts` 14/14 lulus.
