# Keamanan Monitor Karya

Ringkasan keputusan penguatan keamanan (6 Okt 2026). Berkas ini menjelaskan
apa yang dipasang, alasannya, dan apa yang masih perlu diputuskan. Semua
perubahan diperiksa dengan `tsc`, `eslint`, dan `vitest` (tes memakai mock,
tidak menyentuh basis data). Belum ada yang diuji terhadap Supabase sungguhan
atau build produksi.

## Lapisan

| Lapisan | Berkas | Isi |
| --- | --- | --- |
| Proxy (pengganti middleware di Next 16) | `src/proxy.ts` | CSRF untuk mutasi API, batas ukuran badan, CSP bernonce, 404 `/pratinjau` di produksi |
| Header statis | `next.config.ts` + `src/lib/security-headers.ts` | nosniff, Referrer-Policy, Permissions-Policy, CORP, HSTS (produksi), X-Frame-Options & COOP (produksi), `Cache-Control: no-store` untuk `/api` |
| Sesi | `src/lib/auth.ts` | Token HMAC + sidik kata sandi, cookie `__Host-` di produksi |
| Pengaman bersama | `src/lib/security.ts` | Perbandingan waktu-konstan, pembatas laju, IP klien, teks aman, tanda tangan berkas |
| Cron | `src/lib/cron-auth.ts` | Rahasia wajib (≥16 karakter), dibandingkan waktu-konstan |
| Route | `src/app/api/**` | `requireApiUser` + cakupan entitas/divisi/proyek di tiap route |

## 1. Autentikasi & otorisasi route

Semua route di `src/app/api` memakai `requireApiUser()` kecuali:

- `POST /api/auth/login` — publik, dengan pembatas laju.
- `POST /api/auth/logout`, `GET /api/auth/me` — membaca sesi sendiri (tanpa sesi: tidak ada efek / 401).
- `GET /api/cron/*` — dijaga `refuseCron` (CRON_SECRET).

Hasil audit IDOR (id dari body/query tanpa cek kepemilikan). Yang diperbaiki:

| Route | Masalah | Perbaikan |
| --- | --- | --- |
| `GET /api/audit-logs` | Tidak ada cek `audit:read`. PIC/Kepala divisi bisa membaca log seluruh akun di PT-nya, termasuk IP, user-agent, dan isi perubahan akun. | Tanpa `audit:read` hanya jejak sendiri. |
| `POST /api/inbox` | Pemeriksaan `user.scopeEntityId && …` gagal-terbuka. Akun berlingkup tanpa PT bisa meneruskan laporan PT mana pun. | Gagal-tertutup: selain TI/Super Admin, PT laporan harus sama dengan PT akun. |
| `POST /api/work-desk` (`remind-pic`) | Pola gagal-terbuka yang sama. Akun Admin PT/Direktur tanpa PT bisa mengingatkan PIC di semua PT. | Hanya peran grup (`group:read`) yang menjangkau semua PT. |
| `POST /api/projects` (pengajuan) | Akun berlingkup tanpa PT bisa memilih PT bebas lewat `entityId`. | PT bebas hanya untuk peran grup/induk. |
| `POST /api/projects/approve` | Proyek lama dengan rantai kosong bisa diaktifkan oleh pemegang `project:approve` dari PT mana pun. | Wajib dalam cakupan entitas. |
| `PATCH /api/companies/users` | Admin PT bisa mengirim `entityId: null` dan "melepas" akun ke tingkat holding, keluar dari jangkauannya. | Meja terbatas hanya boleh `entityId` PT-nya sendiri. |
| `canWriteEvidence` | Peran pantau (Direktur entitas, Auditor, Manajemen) yang `scopeEntityId`-nya sama dengan PT target bisa menulis/menghapus bukti. | Cabang "PT sama" hanya untuk Admin PT. |

Diperiksa dan sudah benar:

- `/api/outputs`, `/api/project-notes`, `/api/project-stages`, `/api/deadline-proposals` (`guardProjectAccess`).
- `/api/outputs/review` (proyek divisi yang dipimpin), `/api/access-requests` (`decisionDesk` / `mayDecideFor`, tidak memutuskan milik sendiri).
- `/api/admin/overview`, `/api/admin/reminder-rules`, `/api/unlock-requests`, `/api/attendance`, `/api/kadiv/*`, `/api/ringkasan/laporan-dibaca`.
- `/api/tasks`, `/api/daily-input`, `/api/progress-reports`, `/api/weekly-input`, `/api/escalations/actions`.
- `/api/evidence/*`, `/api/notifications` (PATCH hanya milik sendiri).

## 2. Validasi masukan & batas panjang

- **Proxy.** Badan JSON di `/api` maksimal 1 MB; yang terbesar adalah logo perusahaan, 400 rb karakter. `/api/evidence/upload` maksimal 21 MB. Badan `Transfer-Encoding` tanpa `Content-Length` ditolak (411).
- **`next.config.ts`.** `experimental.proxyClientMaxBodySize = 22mb`, karena bawaan 10 MB akan memotong unggahan yang melewati proxy.
- **Batas per kolom.**
  - `tasks`: judul 200, deskripsi 4000, tag 40.
  - `weekly-input`: 4000.
  - `escalations/actions` dan `projects`: 4000.
  - `companies` dan `companies/users`: 500.
  - Bukti: nama 200 dan tautan 2000 (tautan lebih panjang ditolak, tidak dipotong diam-diam).
  - Route P2 (`pic-access.str`) sudah punya batas sendiri.
- **Kata sandi** maksimal 256 karakter (login dan ganti sandi), agar scrypt tidak dipakai untuk DoS.
- **`cleanText`** membuang karakter kendali dan pembalik arah Unicode (Trojan Source) dari nama berkas bukti.

## 3. Pembatasan laju

`src/lib/security.ts` memakai jendela tetap di memori.

| Endpoint | Kunci | Batas |
| --- | --- | --- |
| `POST /api/auth/login` | per akun (identifier) | 5 kegagalan / 15 menit, lalu 429 dengan `Retry-After` |
| `POST /api/auth/login` | per IP | 30 percobaan / 15 menit |
| `POST /api/profile/password` | per akun | 5 kata sandi lama salah / 15 menit |
| `POST /api/work-desk`, `POST /api/notifications/remind`, `POST /api/kadiv/team` | per akun per endpoint | 30 / 5 menit |

Login juga:

- memverifikasi hash tiruan saat akun tidak ada, sehingga waktu jawab "akun tidak ada" sama dengan "sandi salah";
- mencatat setiap kegagalan sebagai `LOGIN_FAILED` di AuditLog.

**Keterbatasan:** hitungan hidup per instans server. Di Vercel tiap instans serverless punya hitungannya sendiri, jadi ini rem terbaik-usaha, bukan kuota global. Untuk kuota global pakai penyimpanan bersama (Upstash Redis / Vercel KV). Itu butuh dependensi dan layanan baru, jadi belum dipasang. Kunci per akun bisa dipakai penyerang untuk mengunci login orang lain selama 15 menit; itu harga yang umum untuk menahan penebakan kata sandi.

## 4. Header keamanan

- **CSP** dipasang per permintaan oleh `src/proxy.ts`:
  - `script-src 'self' 'nonce-…' 'strict-dynamic'`. Next.js menempelkan nonce ke skripnya sendiri, dan `src/app/layout.tsx` meneruskannya ke skrip boot tampilan (`tampilan-boot.ts`) dan ke `ThemeProvider` (next-themes, prop `nonce`).
  - `style-src 'self' 'unsafe-inline'`, karena React merender `style=""` dan sonner/chart menyisipkan `<style>`.
  - `img-src 'self' data: blob: <origin Supabase>`. Logo memakai data URL, foto bukti memakai URL bertanda tangan.
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`.
  - **Mode dev:** dikirim sebagai `Content-Security-Policy-Report-Only` dengan `'unsafe-eval'` dan `ws:`, sehingga pelanggaran hanya tampil di konsol dan tidak merusak pratinjau. Di /pratinjau semua `<script>` membawa nonce, dan tidak ada event `securitypolicyviolation` saat berpindah tab atau membuka Sheet.
  - **Konsekuensi:** `headers()` di root layout membuat semua halaman dirender dinamis. Halaman utama, login, dan pratinjau memang sudah `force-dynamic`.
- **Header statis** (`next.config.ts`):
  - `X-Content-Type-Options: nosniff`.
  - `Referrer-Policy: strict-origin-when-cross-origin`.
  - `Permissions-Policy` mematikan kamera, mikrofon, lokasi, pembayaran, dan sejenisnya.
  - `Cross-Origin-Resource-Policy: same-origin`.
  - `X-DNS-Prefetch-Control: off`.
  - `poweredByHeader: false`.
  - Khusus produksi: `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Frame-Options: DENY`, dan `Cross-Origin-Opener-Policy: same-origin`. X-Frame-Options dan COOP tidak dipasang di dev supaya panel pratinjau tetap bisa menampilkan aplikasi.
  - `/api/*` mendapat `Cache-Control: no-store`.

## 5. Cookie sesi

- `httpOnly`, `SameSite=Lax`, `Secure` di produksi, `Path=/`, berlaku 8 jam.
- Di produksi namanya `__Host-mk_session`. Awalan ini membuat browser menolak cookie tanpa Secure atau dengan Domain, jadi subdomain lain tidak bisa menimpanya.
- **Sidik kata sandi (`pv`)** di dalam token adalah HMAC dari hash kata sandi. Setelah ganti sandi sendiri atau disetel ulang Admin, semua sesi lama otomatis tidak berlaku, tanpa tabel sesi. Pengganti sandi sendiri langsung diberi token baru.
- Token tanpa `pv` (dibuat sebelum perubahan ini) ditolak, jadi **semua pengguna perlu masuk ulang sekali setelah rilis**.
- `SameSite=Lax` dipertahankan (bukan Strict) supaya tautan dari luar tetap masuk. CSRF ditutup oleh pemeriksaan Origin di bawah.
- **Belum ada:** pencabutan sesi saat keluar. Token yang dicuri tetap berlaku sampai kedaluwarsa (maks 8 jam) kecuali sandinya diganti. Pencabutan penuh butuh tabel sesi (perubahan skema).

## 6. CSRF

`src/proxy.ts` memeriksa setiap POST/PUT/PATCH/DELETE ke `/api`:

- `Origin` harus sama dengan `Host`, `X-Forwarded-Host`, atau salah satu `APP_ORIGINS` (lihat `.env.example`). `Origin: null` ditolak.
- Tanpa Origin: `Sec-Fetch-Site` selain `same-origin`/`none` ditolak. Ini juga menutup `same-site`, karena subdomain lain tidak dipercaya.
- Tanpa kedua header (curl, cron): diteruskan, karena klien seperti itu tidak membawa cookie korban; sesi tetap diperiksa route.
- Login juga diperiksa, untuk mencegah login-CSRF.

## 7. Cron

`refuseCron` (`src/lib/cron-auth.ts`) dipakai kedua cron, termasuk `/api/cron/remind-divisions` yang sebelumnya punya salinan sendiri.

- `CRON_SECRET` wajib dan minimal 16 karakter; tanpa itu jawabannya 503.
- Dibandingkan waktu-konstan lewat ringkasan SHA-256 (`safeEqual`), jadi panjang rahasia pun tidak bocor.

## 8. Unggahan bukti

`/api/evidence/upload`:

- **Ukuran.** `Content-Length` diperiksa sebelum badan dibaca (lebih dari 21 MB → 413). Ukuran berkas maks 20 MB, sama dengan sebelumnya.
- **Jenis berkas.** Daftar MIME yang diizinkan dan pasangan ekstensi tetap seperti sebelumnya. Yang baru: **tanda tangan byte awal** harus cocok dengan MIME (`contentMatchesMime`):
  - JPEG, PNG, GIF, WebP, HEIC, PDF, OOXML (ZIP) dan Office lama (OLE);
  - teks/CSV tidak boleh memuat byte NUL.
  - Akibatnya HTML atau skrip yang dinamai `.png` ditolak (415).
- **Nama berkas.** Kunci Storage memakai `safeName` (sudah ada). Nama tampilan dibersihkan dari karakter kendali dan pemisah jalur, maksimal 200 karakter.
- **Tautan bukti** harus URL http(s) yang bisa diurai dan tidak membawa kredensial (`user:pass@`).
- **Akses.** Bucket tetap privat, dibaca lewat URL bertanda tangan 5 menit.

## 9. /pratinjau

- **Proxy:** di produksi menjawab 404 sebelum merender apa pun.
- **`src/app/pratinjau/page.tsx`:** `PreviewApp` dimuat lewat `await import()` di dalam cabang `NODE_ENV !== 'production'`. Build produksi membuang cabang itu, jadi data contoh dan penimpa `window.fetch` di `src/components/preview` tidak ikut terbundel.
- Tidak ada berkas lain yang mengimpor `src/components/preview` (diperiksa dengan grep).
- Belum diverifikasi dengan `next build`: build tidak dijalankan di sesi ini.

## 10. npm audit --omit=dev (6 Okt 2026)

Belum ada yang di-upgrade. `npm install` tidak diizinkan di sesi ini, dan sebagian perbaikannya mayor.

| Paket | Tingkat | Dipakai? | Saran |
| --- | --- | --- | --- |
| `next` 16.3.4 | kritis — RCE di `next/og` `ImageResponse` | `next/og` tidak dipakai di `src` | Selesai: dinaikkan ke 16.3.8 (F1-C) |
| `sharp` ≤0.35.4-rc.0 | tinggi (libvips/libheif) | tidak diimpor; `next/image` juga tidak dipakai | Naikkan bila mulai memakai optimasi gambar (0.35.5 terhitung mayor) |
| `js-yaml` via `@mdxeditor/editor` | tinggi (DoS) | `@mdxeditor/editor` tidak diimpor | Hapus dependensi bila memang tidak dipakai |
| `prismjs` via `react-syntax-highlighter` | sedang | tidak diimpor | Hapus dependensi bila tidak dipakai |
| `deepmerge-ts` via `prisma` (CLI) | tinggi (DoS) | hanya alat build/migrasi | `npm audit fix` menurunkan CLI ke 6.12 (tidak cocok dengan `@prisma/client` 6.19.3), jadi CLI dikembalikan ke 6.19.3; tunggu rilis prisma yang memperbaruinya |

## Temuan yang belum diubah (perlu keputusan)

1. **Kata sandi** — selesai (F1-C, 6 Okt 2026).
   - Minimal 8, maksimal 256 karakter di semua jalur set/ganti/reset (`src/lib/password-policy.ts`; `MIN_PASSWORD` di `src/lib/companies.ts` mengikutinya).
   - Akun yang dibuat atau disetel ulang admin diberi `User.mustChangePassword = true` (migrasi `0018_auth_password`). `/` dan `/login` mengarahkan akun itu ke `/login/ganti-sandi`; `requireApiUser` menolak 403 `{ error: "Ganti kata sandi dulu", code: "MUST_CHANGE_PASSWORD" }` di semua API kecuali `/api/profile/password` (memanggil `requireApiUser({ allowPendingPasswordChange: true })`), `/api/auth/logout`, dan `/api/auth/me`.
   - Akun baru tanpa kata sandi diberi kata sandi acak (bukan "1234"); formulir meja akun mengusulkan kata sandi acak 12 karakter.
   - Seed: `SEED_PASSWORD` wajib ≥ 8 karakter, atau kosong = acak dan dicetak sekali.
   - Selama migrasi 0018 belum diterapkan, sesi tetap terbaca (kolom dianggap false, peringatan sekali di log), tetapi membuat/menyetel ulang akun akan gagal sampai kolomnya ada.
2. **`Caddyfile`** — selesai (F1-C): blok `@transform_port_query` (open proxy/SSRF) dihapus.
3. **Pesan galat mentah** — selesai (F1-C): `unlock-requests`, `access-requests`, `admin/reminder-rules`, `companies`, `companies/users`, `evidence`, `notifications` memakai `src/lib/api-error.ts` (`serverError` = pesan umum + `console.error`; `clientErrorMessage` hanya meneruskan penolakan `Error` biasa yang pendek dan tidak berbau internal).
4. **Log notifikasi** — selesai (F1-C): `GET /api/notifications` hanya mengembalikan notifikasi milik akun itu, untuk semua peran. Kolom `recipient` selalu email akun.
5. **Pencabutan sesi saat keluar** butuh tabel sesi (lihat bagian 5).
6. **Pembatas laju global** butuh penyimpanan bersama (lihat bagian 3).
7. **RLS Supabase.** Migrasi baru mengaktifkan RLS tanpa kebijakan. Aplikasi masuk lewat Prisma dengan peran pemilik, jadi RLS hanya menutup akses lewat PostgREST/anon key. Jangan pernah memakai service role key di browser (saat ini tidak).

## Daftar periksa rilis

- [ ] `AUTH_SECRET` ≥32 karakter acak; `CRON_SECRET` ≥16 karakter acak (di Vercel: Project Settings → Environment Variables).
- [ ] `NEXT_PUBLIC_SUPABASE_URL` diisi saat build supaya CSP mengizinkan gambar bukti.
- [ ] Bila aplikasi dibuka lewat domain di depan proxy yang mengubah Host: isi `APP_ORIGINS`.
- [ ] Setelah deploy, buka aplikasi dan pastikan konsol tidak menampilkan "Refused to execute … Content Security Policy". Periksa juga tema gelap/terang dan aksen: skrip boot memerlukan nonce.
- [ ] Beri tahu pengguna bahwa semua orang perlu masuk ulang sekali.
- [ ] Naikkan `next` ke ≥16.3.6.
