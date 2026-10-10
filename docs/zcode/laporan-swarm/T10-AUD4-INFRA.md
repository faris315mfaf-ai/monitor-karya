# Laporan T10-AUD4 — Audit infrastruktur/keamanan/deploy Monitor Karya

Agen audit T10-AUD4, 10 Oktober 2026. Mode BACA-SAJA: tidak ada kode yang diubah, tidak ada basis data yang disentuh, tidak ada build yang dijalankan. Zona diaudit: `src/proxy.ts`, `src/lib/{auth,security,password,password-policy,account-activation,storage,storage-s3,evidence-access,api-error,security-headers,cron-auth}.ts`, rute API terkait (`/api/auth/*`, `/api/evidence*`, `/api/approval-requests/berkas`, `/api/cron/*`, `/api/health/*`), `Dockerfile`, `docker-compose.dev.yml`, `deploy/**`, `.github/workflows/**`, `scripts/**`, `public/sw.js`, `public/luring.html`, ditambah `next.config.ts` dan `src/components/sw-provider.tsx` sebagai konteks.

## Ringkasan

Tidak ditemukan temuan KRITIS. Fondasi keamanannya kuat dan konsisten (lihat bagian "Yang sudah benar"). Temuan: 3 SEDANG, 8 RENDAH, beberapa catatan INFO. Dua temuan SEDANG bersifat fungsional/privasi (service worker menyimpan data API lintas sesi; proxy memangkas unggahan berkas persetujuan ke 1 MB), satu SEDANG operasional (skrip superadmin tanpa guard basis data produksi).

## Temuan

### [SEDANG] public/sw.js:69-89,103-121 — Cache API menyimpan data pengguna lintas sesi dan tidak pernah dibersihkan saat keluar

`apiHandler` menyimpan salinan semua respons 200 `GET /api/*` (kecuali `/api/auth/*`, `/api/cron/*`, `/api/health`) ke CacheStorage `mk-sw-v1-api` (maks 80 entri, tanpa kedaluwarsa waktu). `next.config.ts` sudah mengirim `Cache-Control: no-store, max-age=0` untuk `/api/*`, tetapi `cache.put()` pada Cache API secara eksplisit menyimpan respons apa pun termasuk yang ber-header no-store — peramban tidak menerapkan semantik no-store pada penyimpanan eksplisit oleh SW.

Skenario serangan/dampak:

1. Komputer kantor bersama. Pengguna A keluar; cache berisi `/api/ringkasan`, `/api/companies` (daftar akun + email), `/api/evidence?...` milik A. Pengguna B masuk; saat jaringan terputus sebentar (atau server >5 detik lambat — `TIMEOUT_DARING`), halaman B meminta URL yang sama dan SW menjawab dengan data milik A, hanya ditandai header `x-mk-dari-luring`. Bocor lintas pengguna pada perangkat bersama.
2. Data PII menetap di disk (CacheStorage bertahan melebihi sesi; tidak pernah dihapus pada logout — `sw-provider.tsx` tidak mengirim pesan apa pun ke SW saat logout).
3. `GET /api/evidence/[id]` ikut tercache: berisi URL bertanda tangan S3/Supabase (masih sah ±5 menit setelah cache ditulis).

Usulan mitigasi:

- Pada logout (rute `/api/auth/logout` atau klien setelah `fetch('/api/auth/logout')`), kirim `navigator.serviceWorker.controller?.postMessage({ type: 'mk-logout' })`; SW menanggapi dengan menghapus `CACHE_API` saja (cache statis tetap).
- Alternatif/komplementer: daftar putih endpoint yang boleh dicache (ringkasan agregat tanpa PII), bukan semua `/api/*`; dan tambahkan `Cache-Control: no-store` pada respons yang tidak boleh dicache dengan pemeriksaan header sebelum `cache.put` (SW membaca `res.headers.get('cache-control')` dan melewati bila berisi `no-store`).

### [SEDANG] src/proxy.ts:23,26,80-85 — Batas badan 1 MB memangkas unggahan berkas persetujuan (`/api/approval-requests/berkas`)

`guardApi` memakai `JSON_MAX_BYTES` (1 MB) untuk semua mutasi API kecuali `UPLOAD_PATH = '/api/evidence/upload'` (21 MB). Rute `src/app/api/approval-requests/berkas/route.ts` (berkas pendukung permintaan persetujuan — "materi video, rincian anggaran") menerima multipart hingga 20 MB (`MAX_EVIDENCE_BYTES`), jadi setiap unggahan berkas persetujuan >1 MB ditolak 413 oleh proxy sebelum mencapai rute. Ini kegagalan fungsional (ketersediaan fitur F2-DIREKTUR), bukan celah keamanan, tapi berada di berkas yang diaudit dan bertentangan dengan komentar rute itu sendiri ("Aturan jenis & ukuran sama dengan /api/evidence/upload").

Skenario: pengguna melampirkan video 8 MB ke permintaan cuti → proxy menjawab 413 "Permintaan terlalu besar." meski rute dan klien mengizinkan 20 MB.

Usulan mitigasi: perluas pengecualian ke daftar jalur unggah (mis. `const UPLOAD_PATHS = new Set(['/api/evidence/upload', '/api/approval-requests/berkas'])`) atau turunkan batas JSON per rute dengan peta jalur→batas. Uji ulang dengan berkas 2–20 MB.

### [SEDANG] scripts/buat-superadmin.ts:19,33-83 — Skrip bisa menulis akun SUPERADMIN ke basis data produksi tanpa konfirmasi

`buat-superadmin.ts` mengimpor `db` dari `src/lib/db` (membaca `.env`) dan langsung membuat/memutakhirkan akun `SUPERADMIN` aktif pada `DATABASE_URL` apa pun. Guard hanya menolak kata sandi lemah pada host non-lokal (`--izinkan-lemah` + LOCAL_HOSTS). Dengan `SUPERADMIN_PASSWORD` yang lolos kebijakan (≥8 karakter), skrip menulis ke produksi secara diam-diam; host basis data baru dicetak setelah tulisan selesai. Berbeda dengan `seed.ts`/`set-passwords.ts`/`demo-accounts.ts` yang semuanya dijaga `requireLocalDatabase`, skrip ini memang dirancang untuk operator, tetapi tidak ada konfirmasi interaktif atau flag eksplisit untuk target non-lokal.

Skenario: pada worktree yang `.env`-nya menunjuk Supabase produksi (konfigurasi yang sah menurut alur kerja proyek), seorang agen/operator menjalankan `SUPERADMIN_PASSWORD=... npx tsx scripts/buat-superadmin.ts admin` untuk "menyiapkan akun demo" → akun superadmin betulan tertanam di produksi, atau akun yang sudah ada dinaikkan perannya dan diganti kata sandinya tanpa jejak.

Usulan mitigasi: sebelum menulis, cetak host tujuan dan minta konfirmasi ketik nama host bila host tidak termasuk LOCAL_HOSTS (atau wajibkan flag `--target-produksi`). Pertimbangkan juga menandai akun buatan skrip dengan `mustChangePassword: true` (set-passwords sudah begitu; buat-superadmin belum, baris 60-79).

### [RENDAH] public/luring.html:57-65 — Skrip inline tanpa nonce diblokir CSP produksi; fitur deteksi daring halaman luring mati

`src/proxy.ts:109-116` menerapkan CSP bernonce (`script-src 'self' 'nonce-…' 'strict-dynamic'`) ke semua jalur yang lolos matcher — termasuk `public/luring.html` (ekstensi `.html` tidak dikecualikan matcher baris 119-124, dan `staticSecurityHeaders` tidak menambah `unsafe-inline` untuk skrip). Akibatnya blok `<script>` inline pada halaman luring tidak pernah berjalan di produksi: teks "Terakhir memeriksa koneksi" kosong dan pendengar `online` (coba-otomatis) tidak terpasang; tombol "Coba lagi" tetap hidup karena atribut `onclick` … juga dicegah? Tidak — atribut handler inline juga diblokir tanpa `unsafe-inline`, jadi hanya `location.replace` pada klik tombol yang gagal bila mengandalkan onclick. Dampak keamanan: tidak ada; dampak keandalan fitur luring: ya.

Usulan mitigasi: pindahkan skrip ke berkas eksternal `public/luring-app.js` (kena `script-src 'self'` — catatan: dengan `strict-dynamic`, `'self'` diabaikan untuk pemuatan oleh markup, tetapi skrip eksternal dengan atribut `nonce` tetap perlu nonce; paling sederhana: sisipkan nonce dari sisi server tidak mungkin untuk berkas statis, jadi ganti logika menjadi tanpa JS atau layani halaman luring lewat route handler yang menyuntikkan nonce). Alternatif termudah: hapus ketergantungan JS (statis murni) karena tombol `location.replace('/')` bisa diganti tautan biasa `<a href="/">`.

### [RENDAH] src/lib/security.ts:45-51 — Kepercayaan pada `x-real-ip` hanya dijaga oleh konfigurasi proxy, bukan oleh aplikasi

`clientIp()` memprioritaskan `x-real-ip`. Template `deploy/app-vps/monitor-karya.caddy:13-14` benar menimpa `X-Real-IP {remote_host}` dan `X-Forwarded-For {remote_host}`, dan Vercel juga menyetelnya — jadi pada deployment yang didokumentasikan aman. Namun aplikasi sendiri tidak memverifikasi asal header; deployment dengan proxy lain (nginx tanpa konfigurasi, atau kontainer ter-ekspos langsung) meneruskan header pilihan klien → kunci batas laju per-IP (`login:ip:*`, `activation:ip:*`) bisa dimutasi bebas. Batas per-akun (5 gagal/15 menit per identifier, `src/app/api/auth/login/route.ts:50-55`) tetap menahan penebakan sandi satu akun, tetapi penyemprotan banyak akun dari satu mesin lewat batas IP.

Skenario: aplikasi dijalankan di belakang nginx yang hanya `proxy_pass` tanpa `proxy_set_header X-Real-IP` → penyerang menyetel `X-Real-IP` acak per permintaan; setiap permintaan jatuh ke ember berbeda; hanya kuota per-instans dan per-akun yang tersisa.

Usulan mitigasi: dokumentasikan syarat wajib proxy (sudah ada di komentar; tambahkan pemeriksaan boot: bila `NODE_ENV=production` dan tidak ada indikasi proxy tepercaya — mis. `X-Forwarded-Proto` dari Caddy/Vercel — catat peringatan tegas), atau jatuhkan prioritas `x-real-ip` menjadi hanya ketika `x-forwarded-proto` hadir dari proxy yang sama.

### [RENDAH] src/app/api/auth/login/route.ts:50-55 — Kunci batas laju per-identifier memungkinkan penguncian akun korban (DoS ketersediaan)

`login:acct:<identifier>` dihitung pada setiap kegagalan dan `peek` menolak semua percobaan berikutnya (termasuk kata sandi benar) sampai jendela 15 menit berlalu. Siapa pun yang mengetahui username korban dapat mengunci akun itu berulang (5 permintaan gagal per 15 menit cukup). Ini trade-off lazim anti-brute-force, tetapi tanpa jalur pemulihan (self-service/ops) menjadi alat DoS terhadap PIC/ketua divisi tertentu, misalah menjelang tenggat 17.00 WIB.

Usulan mitigasi: gabungkan kunci per-identifier dengan kunci per-(IP, identifier) sehingga pemilik sah dari jaringan berbeda tetap bisa masuk; atau terapkan penundaan progresif (delay respons) alih-alih penolakan mutlak; sedianya catat `LOGIN_FAILED` sudah ada untuk deteksi.

### [RENDAH] src/lib/password.ts:16 — Parameter scrypt di bawah rekomendasi mutakhir (N=16384)

`SCRYPT_N = 16384` (2^14), r=8, p=1 implisit. Panduan OWASP Password Storage menyarankan scrypt N ≥ 2^16–2^17 (atau argon2id). 2^14 masih memberi perlindungan wajar untuk kata sandi ≥8 karakter acak, tetapi margin terhadap perangkat keras GPU/ASIC 2026 menyusut.

Usulan mitigasi: naikkan ke N=2^17 (ukur dampak latensi masuk; komentar menyebut target <100 ms) dengan format hash baru (`scrypt$131072$...`) dan verifikasi mundur-kompatibel terhadap baris lama + penulisan ulang bertahap saat login sukses (rehash-and-login), seperti pola yang sudah dipakai untuk migrasi kolom.

### [RENDAH] src/app/api/evidence/[id]/route.ts:29-32 — Tautan bukti warisan dikembalikan tanpa validasi skema saat dibaca

`POST /api/evidence` (baris 68-73 di `src/app/api/evidence/route.ts`) memang menvalidasi `isHttpUrl` sejak fitur itu ada, tetapi `GET /api/evidence/[id]` mengembalikan `evidence.url` lama apa adanya. Baris yang dibuat sebelum validasi (atau lewat jalur lain) bisa memuat `javascript:`/`data:`; klien membukanya lewat `window.open(item.url, '_blank', 'noopener,noreferrer')` (mis. `src/components/work-desk/admin-desk.tsx:199`, `src/components/views/daily-input-view.tsx:227`). `noopener` membatasi dampak, dan peramban modern memblokir banyak kasus, tetapi ini lapisan pertahanan yang hilang untuk data lama.

Usulan mitigasi: di `GET /api/evidence/[id]` (dan endpoint daftar yang menyertakan `url`), tolak/netralkan baris yang `url`-nya bukan `http(s)://` tanpa kredensial (pakai `isHttpUrl` yang sama, pindahkan ke modul bersama), atau jalankan migrasi data sekali untuk membersihkan baris lama.

### [RENDAH] src/app/api/auth/logout/route.ts:24 dan src/app/api/evidence/[id]/route.ts:81 — IP audit memakai entri PERTAMA X-Forwarded-For, tidak konsisten dengan `clientIp()`

Kedua rute menulis `ip: req.headers.get('x-forwarded-for')?.split(',')[0]`, sedangkan `clientIp()` memakai `x-real-ip` lalu entri TERAKHIR XFF (komentar di `security.ts:36-43` menjelaskan entri pertama justru yang bisa diisi klien). Pada deployment Caddy template XFF ditimpa penuh sehingga tidak ada dampak; pada deployment berantai (CDN + Caddy) atau Vercel, entri pertama bisa dipilih penyerang → jejak audit `LOGOUT`/`REMOVE_EVIDENCE` bisa dicatut (merusak integritas bukti audit, bukan akses).

Usulan mitigasi: ganti kedua pemakaian dengan `clientIp(req)` agar atribusi IP tunggal dan konsisten di seluruh audit log.

### [RENDAH] .github/workflows/ci.yml:19-29, .github/workflows/android.yml:24-29 — Actions dipin berdasarkan tag, bukan SHA

`actions/checkout@v4`, `setup-node@v4`, `setup-python@v6`, `setup-java@v4`, `gradle/actions/setup-gradle@v4`, `upload-artifact@v4` semuanya tag mengambang. Kompromi salah satu tag eksekusi kode arbitrer di CI (konteks `permissions: contents: read` membatasi dampak pada repo ini, tetapi pull request pihak ketiga menjalankan workflow ini pada kode tak terpercaya).

Usulan mitigasi: pin ke commit SHA lengkap (mis. `actions/checkout@<sha>`) dan pertimbangkan pembatasan `pull_request` dari fork (mis. `if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository`) bila belajar dari praktik supply-chain.

### [RENDAH] src/lib/storage.ts:85 — Komponen acak kunci penyimpanan memakai `Math.random()`

`buildStorageKey` menyusun kunci `targetType/targetId/<stamp>-<rand>-<nama>` dengan `rand = Math.random().toString(36).slice(2, 8)` (~31 bit) — bukan PRNG kripto. Saat ini tidak dieksploitasi: kunci tidak pernah diterima dari klien untuk membuat URL bertanda tangan (semua minta URL membaca `storageKey` dari baris DB setelah cek otorisasi), jadi menebak kunci tidak memberi apa pun. Namun pola ini rapuh bila kelak ada endpoint yang menandatangani kunci pilihan pemanggil.

Usulan mitigasi: ganti dengan `randomBytes(6).toString('base64url')` dari `node:crypto` (berkas sudah di lingkungan server; `storage.ts` berprefix `server-only`).

### [INFO] Catatan kecil

- `deploy/app-vps/proxy/Caddyfile:3` — email ACME masih `admin@contoh.id` (placeholder); operator wajib mengganti atau sertifikat produksi gagal/memakai identitas keliru.
- `deploy/db-vps/new-database.sh:38-42` — kata sandi role dicetak ke stdout terminal operator (kesengajaan untuk ditempel ke `.env.production`); ingatkan dalam README bahwa scrollback/log sesi SSH ikut menyimpannya.
- `scripts/demo-accounts.ts:50` — satu hash dibagi 8 akun contoh (salt sama untuk semua). Hanya untuk DB lokal (dijaga guard); jangan ditiru pada akun nyata.
- `src/lib/api-error.ts:19-26` — filter pesan aman-klien memakai blocklist kata kunci; pendekatan allowlist (pesan yang secara eksplisit ditandai aman) lebih tahan kebocoran ke depan.
- `docker-compose.dev.yml` — Postgres dev hanya terikat `127.0.0.1:54329`; kredensial tetap (dev-only) dapat diterima.
- Batas laju dalam memori per-instans (security.ts:82-93) — di Vercel serverless tiap instans punya ember sendiri; sudah didokumentasikan sebagai "rem, bukan kuota" dan deployment VPS satu kontainer efektif global.
- Penyemprotan akun: tidak ada batas global upaya masuk selain per-IP dan per-akun; dengan botnet IP banyak, 5 tebakan/15 menit/akun masih mungkin. Pertimbangkan pembatasan tambahan berbasis anomaly (gagal lintas banyak identifier dari prefiks IP sama).

## Yang sudah benar (diperiksa dan lolos)

Autentikasi & sesi (`src/lib/auth.ts`):

- Token sesi HMAC-SHA256 (`AUTH_SECRET` diwajibkan ≥32 karakter, gagal cepat), verifikasi tanda tangan dengan `timingSafeEqual` + cek panjang, penolakan token tanpa `sid`/`pv`.
- Sesi dicatat di tabel `authSession` (revocable, kedaluwarsa); logout mencabut `revokedAt`; baris akun dibaca ulang tiap permintaan (deaktivasi/ubah peran langsung berlaku).
- Sidik kata sandi (`pv`) membatalkan semua sesi lama saat kata sandi berganti — dibandingkan waktu-konstan.
- Cookie: `__Host-` di produksi (memaksa Secure+Path=/+tanpa Domain), `httpOnly`, `SameSite=Lax`, `secure` di produksi; maxAge 8 jam.
- Login: pesan seragam untuk akun-tak-ada vs sandi-salah; hash dummy untuk menyamakan waktu; batas laju per-akun dan per-IP; audit `LOGIN`/`LOGIN_FAILED`.

CSRF/CSP (`src/proxy.ts`, `src/lib/security-headers.ts`):

- Mutasi API wajib same-origin: `Origin` diparsing (bukan pencocokan string), `null` ditolak, gagal parse ditolak, `Sec-Fetch-Site` lintas situs ditolak; `Host`/`X-Forwarded-Host`/`APP_ORIGINS` jadi set host sah. `X-Forwarded-Host` masuk set host tepercaya, tetapi peramban tidak mengizinkan header itu pada form/cross-origin `no-cors` fetch dan preflight CORS akan gagal — tidak menjadi vektor CSRF peramban yang realistis (dicatat sebagai desain longgar, bukan celah).
- CSP bernonce + `strict-dynamic`; `object-src 'none'`, `frame-ancestors 'none'`, `base-uri`/`form-action` `self`, `upgrade-insecure-requests` di produksi; dev sebagai Report-Only. `unsafe-inline` hanya untuk `style-src` (diperlukan React inline style). Sumber penyimpanan satu origin tervalidasi ketat (bukan wildcard), tanpa kredensial.
- Header statis lengkap (nosniff, XFO DENY, Referrer-Policy, Permissions-Policy, COOP/CORP, HSTS prod). `/pratinjau` 404 di produksi. Badan permintaan dibatasi (Content-Length wajib; chunked ditolak).

Aktivasi akun (`src/lib/account-activation.ts`): token 256-bit acak, disimpan sebagai hash SHA-256 (token mentah tidak pernah di DB/log); dikirim dalam fragmen URL (`#token=` — tidak masuk log server/Referer) dan klien membersihkan riwayat dengan `replaceState`; konsumsi atomik (`SELECT … FOR UPDATE` + `updateMany` bersyarat `consumedAt: null` + `updateMany` User bersyarat — race dua konsumsi paralel harus gagal salah satu); penerbitan menimpa token lama dan memeriksa `credentialDigest` agar tautan lama mati saat kredensial berubah; possession token tidak pernah menghasilkan sesi (hanya setel kata sandi, tetap harus masuk); rate limit penerbitan (per aktor/per target) dan konsumsi (global/per IP/per token).

Storage (`src/lib/storage.ts`, `storage-s3.ts`, `evidence-access.ts`): bucket privat, hanya URL bertanda tangan 5 menit; URL hanya dibuat setelah `canReadEvidence` (cakupan entitas subtree); hapus hanya lewat `canWriteEvidence` (PIC proyek/kadiv/Admin PT/master, bukan peran pantau) plus kunci laporan (17.00, diteruskan, terkunci, review output); MIME divalidasi ekstensi + magic bytes di lapisan API untuk KEDUA driver (fokus "S3 tidak memvalidasi MIME" ternyata tertutup di rute: `evidence/upload/route.ts:101-124`, `approval-requests/berkas/route.ts:95-108`); signer S3 menolak dot-segment, header CRLF, endpoint aneh, `if-none-match: *` mencegah timpa objek, tanpa ACL publik, redirect error, timeout.

Docker/deploy: multi-stage; runner dan migrate `USER node`; tidak ada rahasia di build arg/layer (`AUTH_SECRET` placeholder, DB dummy loopback; `.dockerignore` mengecualikan `.env*`, kunci, dump); compose produksi `read_only`, `cap_drop ALL`, `no-new-privileges`, tanpa `ports:` (hanya `expose` di jaringan internal `web`); Caddy menimpa `X-Real-IP`/`X-Forwarded-For` dan menutup `/api/cron/*` dari internet; cron memanggil dari dalam kontainer (rahasia tidak di crontab); `refuseCron`/`refuseOperational` memakai `safeEqual`; deploy.sh memverifikasi `.env.production` 600, pohon bersih, kunci flock, konfirmasi ketik "ya" untuk migrasi, rollback image; backup terenkripsi `age` (kunci privat di luar VPS) + rclone offsite + SHA256SUMS; restore menolak menimpa DB existing; harden.sh lengkap (SSH kunci-saja, UFW limit, fail2ban, unattended-upgrades, sysctl).

Scripts: `seed.ts`, `set-passwords.ts`, `demo-accounts.ts`, `guard-db-lokal.ts` menolak selain `127.0.0.1:54329/54339` + `/monitor_karya_local` + whitelist param koneksi (anti-redirect `host`/`options`); seed menghapus-anak-sebelum-induk dalam satu transaksi; `SEED_PASSWORD` lemah = galat, kosong = acak sekali-cetak; `pra-rilis.sh` me-unset semua env rahasia warisan shell dan memakai rahasia acak per-jalankan; `db-lokal.sh` memvalidasi URL sebelum Docker/Prisma.

Service worker (bagian yang benar): tidak pernah menyentuh POST/PUT/PATCH/DELETE (baris 105 `if (req.method !== 'GET') return`) — mutasi selalu ke jaringan, tanpa antrean; `/api/auth/*`, `/api/cron/*`, `/api/health` dikecualikan; hanya origin sendiri; versi cache dirotasi nama versi.

## Prioritas tindak lanjut yang disarankan

1. SW: bersihkan `mk-sw-v1-api` saat logout + hormati `no-store` sebelum `cache.put` (temuan SEDANG pertama) — perubahan kecil, dampak privasi besar.
2. Proxy: jalur unggah `/api/approval-requests/berkas` masuk batas 21 MB (temuan SEDANG kedua) + uji regression 2–20 MB.
3. `buat-superadmin.ts`: konfirmasi/flag eksplisit untuk host non-lokal.
4. Konsistensi `clientIp()` di logout & evidence DELETE; nonce/eksternalisasi skrip luring.html.
5. Naikkan parameter scrypt (dengan rehash bertahap) dan pin SHA untuk GitHub Actions.
