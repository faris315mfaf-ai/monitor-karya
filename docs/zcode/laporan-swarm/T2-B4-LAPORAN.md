# Laporan T2-B4 — Bukti end-to-end unggah→baca→hapus dengan driver S3 (MinIO lokal)

Dikerjakan Zcode (agen T2-B4), 8 Oktober 2026. Zona: `scripts/uji-s3-lokal.sh` (baru) dan laporan ini. Cabang `codex/kerja`, tanpa commit. Semua uji LOKAL dengan Docker sekali pakai; tidak ada akses Supabase/produksi (A2-08 tetap milik pemilik).

## Metode

`bash scripts/uji-s3-lokal.sh` mengotomatisasi seluruh alur dan lulus `bash -n` serta `shellcheck -S warning`. Bukti jalur penyimpanan diambil lewat driver S3 murni (`src/lib/storage.ts` → `src/lib/storage-s3.ts`, SigV4 buatan sendiri, path-style) dengan MinIO sekali pakai, sehingga jalur unggah/baca/hapus objek terbukti tanpa menyentuh Supabase.

Keputusan teknis penting:

- **Postgres**: kontainer `postgres:17-bookworm` sekali pakai di `127.0.0.1:54329` (user `mk_local`, db `monitor_karya_local`), kata sandi acak per-jalankan, metadata tiruan `storage.buckets` identik `docker-compose.dev.yml` (dipakai migrasi 0006). Kesiapan ditunggu lewat `pg_isready -h 127.0.0.1` **dan** port TCP host, karena `pg_isready` lewat exec (socket unix) bisa berhasil mengikat server init sementara sebelum port terpublikasi mendengar (kegagalan ini benar-benar terjadi pada percobaan awal dan diperbaiki begitu).
- **MinIO**: repositori `minio/minio`/`minio/mc` telah dihapus MinIO dari Docker Hub (September 2026) — `docker pull` ditolak `pull access denied` meski tarikan citra lain sukses. Skrip mencoba citra resmi dahulu lalu jatuh ke cermin lokal `pgsty/minio`/`pgsty/mc` (build MinIO asli; `minio version RELEASE.2026-08-04...`, diverifikasi berjalan `server`/`mb`/`pipe`/`ls`/`cat` sebelum dipakai). API internal sengaja `:9002` sama dengan port host agar URL bertanda tangan (host kontainer) dapat diambil dari host lewat `curl --resolve` tanpa merusak header Host yang ikut ditandatangani.
- **Aplikasi**: `docker build --target runner -t mk-s3-test .` — build terjadi di dalam kontainer; `.next`/`node_modules` repo tidak disentuh (tidak ada `next dev`/`next build` di repo). Kontainer aplikasi berjalan di jaringan Docker yang sama dengan postgres/minio (`DATABASE_URL` ke host kontainer), `STORAGE_DRIVER=s3`, `S3_ENDPOINT=http://mk-s3-test-minio:9002`, `S3_BUCKET=evidence`, `S3_FORCE_PATH_STYLE=true`, `APP_ORIGINS=http://127.0.0.1:3231`, `AUTH_SECRET` acak ≥32.
- **Cookie**: cookie sesi produksi bertanda Secure berawalan `__Host-`, jadi curl tidak akan mengirimnya lewat http; token diekstrak dari header `Set-Cookie` lalu dikirim ulang sebagai header `Cookie` (sisi server membaca cookie tanpa memeriksa asal https).
- **Rahasia**: semua kata sandi (Postgres, MinIO root, `SEED_PASSWORD`, sandi baru TI, `AUTH_SECRET`) dibuat acak per-jalankan lewat `openssl rand -hex`, disimpan hanya di direktori kerja 0700/berkas 0600 di bawah `/tmp`, dihapus trap EXIT; tidak ada yang dicetak ke log/laporan ini. `docker run` untuk mc menerima kredensial lewat `-e`, bukan argumen ps.

## Hasil tiap langkah

Ringkasan akhir skrip: **34 lulus, 0 gagal, exit 0**. Tidak ada respons 5xx/503 pada alur API.

| Langkah | Bukti |
|---|---|
| 1. Port bebas | `lsof` 54329/9002/9003/3231 kosong; setelah selesai, keempatnya kosong kembali |
| 2. Postgres + migrasi | kontainer siap; `npx prisma migrate deploy` (DATABASE_URL/DIRECT_URL → 54329): **26 migrasi diterapkan, semua sukses** — "All migrations have been successfully applied." (25 migrasi baku 0001–0028 **plus 0029_auditlog_operational_index** dari T2-B1 yang memang ada di pohon kerja belum terkomit; tidak ada migrasi gagal) |
| 3. MinIO + bucket | `/minio/health/live` 200; `mc mb` → "Bucket created successfully `t/evidence`" |
| 4. Seed | `LOCAL_DB_PORT=54329 npm run db:seed` dengan `SEED_PASSWORD` acak (guard lolos, target benar); "Seed completed successfully" |
| 5. Build + aplikasi | `docker build --target runner -t mk-s3-test .` sukses; aplikasi hidup; `GET /api/health/ready` → **200** (SELECT 1 lewat jaringan kontainer) |
| 6a. Masuk | `POST /api/auth/login` (ti@karya.co.id, peran TI/master) → **200**; cookie sesi diterima; `mustChangePassword: true` |
| 6b. Ganti sandi wajib | `POST /api/profile/password` → **200**; sesi diputar (cookie baru) |
| 6c. Target sah | `GET /api/projects` → **200**; `projectId` diambil dari respons |
| 6d. Unggah | `POST /api/evidence/upload` multipart (`file`=bukti.txt 54 B text/plain, `targetType=PROJECT_CLOSING`, `targetId`, `label`) → **200**; baris Evidence dibuat, `storageKey=PROJECT_CLOSING/<projectId>/muz21n3y-n6dsgj-bukti.txt` |
| 6e. Objek muncul | `mc ls --recursive` → `[2026-10-08 04:47:12 UTC] 54B STANDARD PROJECT_CLOSING/.../muz21n3y-n6dsgj-bukti.txt` (tepat satu objek) |
| 6f. Baca | `GET /api/evidence/<id>` → **200**, `kind=file` + URL tanda tangan (TTL 300 dtk); `GET` URL itu ke MinIO → **200**, `cmp` isi unduhan identik byte-per-byte dengan berkas asli |
| 6g. Hapus | `DELETE /api/evidence/<id>` → **200**; `mc ls --recursive` → bucket kosong (objek hilang); `GET /api/evidence/<id>` ulang → **404** (baris DB juga hilang) |
| 7. Bersihkan | kontainer `mk-s3-test-app`/`-minio`/`-pg`, jaringan `mk-s3-test-net`, image `mk-s3-test`, direktori rahasia `/tmp/mk-s3-test.*` semuanya dihapus; keempat port bebas kembali |

## Yang terbukti dan tidak

Terbukti (lokal, sekali-jalankan penuh): pemilihan driver `STORAGE_DRIVER=s3`, validasi konfigurasi S3, unggah PUT SigV4 (`if-none-match: *`), penerbitan URL GET bertanda tangan (path-style, endpoint origin), pengambilan isinya, hapus DELETE, konsistensi baris `Evidence` di Postgres dengan objek di bucket (muncul lalu hilang), alur sesi produksi (login → wajib ganti sandi → sesi diputar), gerbang proxy (tidak ada 503/5xx pada alur), serta audit trail unggah/hapus dibuat tanpa galat.

## Berkas berubah

- `scripts/uji-s3-lokal.sh` — baru; otomasi langkah 1–7 (bash + curl + docker + mc), `bash -n` dan `shellcheck -S warning` lulus.
- `docs/zcode/laporan-swarm/T2-B4-LAPORAN.md` — laporan ini.

## Keterbatasan

- **Driver supabase tetap belum terbukti eksternal** — butir A2-08 (`EXTERNAL_PENDING`) tetap milik pemilik; uji ini hanya menutup risiko jalur S3. Penyimpanan `supabase` lewat `@supabase/supabase-js` tidak dieksekusi sama sekali.
- MinIO diuji lewat cermin `pgsty/minio`/`pgsty/mc` (build MinIO asli) karena `minio/minio` resmi sudah tidak ada di Docker Hub; skrip tetap mencoba citra resmi lebih dahulu. Perilaku S3 yang diuji adalah yang kompatibel-SigV4 umum, bukan AWS S3 sungguhan (kunci akses IAM, versioning, dll. tidak diuji).
- Uji satu berkas text/plain kecil pada satu target (`PROJECT_CLOSING`) sebagai peran TI; jenis MIME lain, target lain (DAILY_REPORT terkunci, OUTPUT saat review), batas 20 MB, dan kedaluwarsa URL 5 menit tidak diuji ulang di sini (sudut itu milik tes unit/executor lain).
- `readiness.txt` probe CX20 (`_health/readiness.txt`) tidak dipasang — `/api/health/ready` memang hanya memeriksa DB; probe storage CX20 adalah prosedur operator yang terpisah.
- Bangunan image memakai pohon kerja `codex/kerja` apa adanya (termasuk perubahan belum terkomit agen lain, mis. migrasi 0029); hasil ini bukan jaminan gabungan final — penggabungan oleh koordinator.
- Tanpa commit; tidak ada perubahan kode aplikasi. Kontainer/port milik orang lain (54339/3200/3100/3211/54349, `monitor-karya-dev-postgres-1`, `simrs-*`, `ruangkerja-*`) tidak disentuh dan tetap berjalan; `vendor/braces` utuh.
