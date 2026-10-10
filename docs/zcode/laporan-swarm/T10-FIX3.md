# Laporan T10-FIX3 — Perbaikan 3 temuan SEDANG audit T10-AUD4-INFRA

Agen perbaik T10-FIX3, 10 Oktober 2026. Memperbaiki 3 temuan SEDANG dari `docs/zcode/laporan-swarm/T10-AUD4-INFRA.md`. Tanpa git (commit), tanpa basis data, tanpa gradle.

## Ringkasan perubahan

| Temuan | Berkas | Perbaikan |
| --- | --- | --- |
| [S1] PII di CacheStorage | `public/sw.js`, `src/components/sw-provider.tsx`, `src/components/shell.tsx`, `src/app/login/ganti-sandi/forced-password-form.tsx` | SW tidak lagi menyimpan/menyajikan respons `/api/*`; cache dibersihkan saat logout |
| [S2] Batas badan 1 MB memotong unggahan persetujuan | `src/proxy.ts`, `tests/api/proxy.test.ts` | `/api/approval-requests/berkas` masuk pengecualian 21 MB |
| [S3] Skrip superadmin bisa menulis ke produksi | `scripts/buat-superadmin.ts` | Guard host non-lokal + flag `--saya-yakin` |

## [S1] Service worker tidak lagi menyimpan respons API

`public/sw.js`:

- `apiHandler`, `cacheApiPut`, `BATAS_API`, dan `JANGAN_CACHE_API` dihapus. Handler `fetch` kini hanya menangani (a) navigasi daring-duluan → fallback `/luring.html` dan (b) aset statis `_next/static`/ikon/logo (stale-while-revalidate). Semua `GET /api/*` dibiarkan langsung ke jaringan — respons API (yang memuat PII: daftar akun+email, URL bertanda tangan bukti) tidak pernah masuk CacheStorage dan tidak bisa disajikan ulang ke pengguna berikutnya di perangkat bersama.
- Rotasi nama versi `mk-sw-v1` → `mk-sw-v2`: handler `activate` yang sudah ada otomatis menghapus cache lama (termasuk `mk-sw-v1-api` warisan yang mungkin sudah berisi PII di perangkat pengguna) saat SW baru aktif.
- Listener `message` baru: pesan `{ type: 'CLEAR_CACHES' }` dari klien → `caches.delete(CACHE_API)` lalu hapus SEMUA cache SW (`caches.keys()` → `Promise.all(keys.map(...))`, ditunggu lewat `event.waitUntil`).

Klien (`src/components/sw-provider.tsx`): fungsi baru `hapusCacheServiceWorker()` mengirim `navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHES' })` (no-op bila SW belum aktif/mode dev). Dipanggil di dua satu-satunya titik logout klien:

- `src/components/shell.tsx` (`useSignOut`) — setelah `POST /api/auth/logout` selesai (baik ok maupun gagal cabut, sebelum `router.replace('/login')`; jalur fetch-gagal tetap meninggalkan halaman seperti perilaku lama).
- `src/app/login/ganti-sandi/forced-password-form.tsx` (`signOut`) — sebelum `window.location.replace('/login')`.

Catatan perilaku baru: saat luring, permintaan API kini gagal ke jaringan (tidak lagi disajikan data basi bertanda `x-mk-dari-luring`). Halaman yang pernah dibuka + `/luring.html` tetap terbaca — sesuai lingkup "fallback offline untuk navigasi dan aset statis" yang diminta. Toast luring di `sw-provider.tsx` masih akurat (menyebut "halaman yang pernah dibuka masih bisa dibaca"; teksnya memang tidak menjanjikan data API).

## [S2] Proxy: unggahan berkas persetujuan sampai 20 MB

`src/proxy.ts`: `UPLOAD_PATH` (satu jalur) menjadi `UPLOAD_PATHS = new Set(['/api/evidence/upload', '/api/approval-requests/berkas'])`; `guardApi` memakai `UPLOAD_PATHS.has(pathname)` sehingga kedua jalur unggah multipart mendapat batas `UPLOAD_MAX_BYTES` (21 MB = 20 MB berkas + pembungkus), selaras dengan `MAX_EVIDENCE_BYTES` di rute. Jalur lain tetap 1 MB.

`tests/api/proxy.test.ts`: tes batas badan diperluas — kedua jalur lolos pada 2 MB dan 20,5 MB, ditolak 413 pada 30 MB; JSON biasa tetap ditolak pada 2 MB.

## [S3] Skrip superadmin: guard basis data non-lokal

`scripts/buat-superadmin.ts`: sebelum menyentuh basis data, bila host `DATABASE_URL` tidak termasuk `LOCAL_HOSTS` (localhost/127.0.0.1/::1/host.docker.internal) dan flag `--saya-yakin` tidak diberikan, skrip melempar galat yang menyebut host tujuan dan cara override — selaras pola `requireLocalDatabase` pada `set-passwords`/`seed`/`demo-accounts`, tapi tetap mengizinkan operasi produksi yang disengaja (sifat skrip operator). Dengan `--saya-yakin`, cetak peringatan tegas lalu lanjut. Pemeriksaan berjalan sebelum hashing scrypt dan sebelum kueri apa pun. Flag `--saya-yakin` tidak memengaruhi parsing username (diabaikan seperti flag lain). Guard kata sandi lemah (`--izinkan-lemah` + lokal) tidak berubah.

## Uji

- `node --check public/sw.js` — lulus.
- `npx tsc --noEmit --incremental false` — lulus (exit 0, tanpa diagnosis).
- `npx eslint src/components/sw-provider.tsx src/components/shell.tsx src/app/login/ganti-sandi/forced-password-form.tsx src/proxy.ts scripts/buat-superadmin.ts tests/api/proxy.test.ts` — lulus (exit 0).
- `npx vitest run tests/api/proxy.test.ts` — 6/6 lulus (termasuk kasus unggah persetujuan baru).
- Tidak menjalankan DB, migrasi, atau git apa pun.

## Sisa yang TIDAK dikerjakan (di luar lingkup T10-FIX3)

Temuan RENDAH/INFO T10-AUD4 lain (skrip inline `luring.html`, konsistensi `clientIp()`, parameter scrypt, pin SHA Actions, dll.) tidak disentuh. Dua catatan lanjutan opsional untuk pemilik:

- `hapusCacheServiceWorker` menghapus juga cache statis saat logout, jadi halaman yang pernah dibuka tidak lagi tersedia luring bagi pengguna berikutnya sampai daring kembali — ini konsekuensi disengaja dari "hapus semua cache saat logout" (privasi di atas kenyamanan di perangkat bersama).
- Audit juga menyarankan `mustChangePassword: true` pada akun buatan `buat-superadmin.ts` (set-passwords sudah begitu); tidak diminta dalam tugas ini, dibiarkan agar kata sandi operator tidak dipaksa diganti.
