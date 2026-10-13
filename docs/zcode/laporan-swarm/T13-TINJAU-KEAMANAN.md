# T13 - Tinjau keamanan perubahan belum-commit (git diff codex/kerja, 125 berkas)

Tanggal: 12 Okt 2026. Mode baca-saja. Tes terkait (login, password-scrypt, t11/t12 API) lulus: 45/45.
Ringkasan: tidak ada CRITICAL/HIGH. 2 MEDIUM, 6 LOW, sisanya INFO. Semua `$queryRaw` baru berupa tagged template berparameter (aman dari injeksi; tidak ada *Unsafe/Prisma.raw). Semua 6 SHA GitHub Actions cocok dengan tag yang dimaksud.

## MEDIUM

### M1. Plafon login lintas-IP 100/15 menit tetap bisa dipakai mengunci akun (DoS) dan memperlonggar brute-force 20x
- src/app/api/auth/login/route.ts:23, 56, 62, 78
- Alur: `peek(acct-any)` dijalankan SEBELUM verifikasi sandi, jadi begitu 100 kegagalan terkumpul, pemilik sah dengan sandi benar dari IP mana pun mendapat 429. Setiap IP hanya bisa menyumbang 5 kegagalan (bucket `acct:<ip>:<id>` memblokir lebih dulu), jadi penyerang butuh >=20 IP berbeda. Dengan satu blok IPv6 /64 (Caddy memakai `remote_host` per alamat penuh) itu murah, dan jendela 15 menit bisa diperbarui terus. Contoh: skrip mengirim 5 percobaan salah dari tiap 20 alamat IPv6 untuk username `superadmin` setiap 15 menit, sehingga Super Admin/Admin PT terkunci terus (username mudah ditebak dari UI/laporan).
- Sebaliknya batas tebak per akun naik dari 5 menjadi 100 per 15 menit (9.600/hari) bagi penyerang dengan banyak IP.
- Perbaikan: jangan blokir total di plafon lintas-IP. Beri cookie perangkat bertanda tangan HMAC (HttpOnly, 90 hari) setelah login sukses dan bebaskan perangkat itu dari `acct-any`; perangkat baru kena penundaan progresif/CAPTCHA, bukan 429 keras. Tambahkan notifikasi/audit `LOGIN_LOCKOUT` untuk akun berperan tinggi.

### M2. Eviction ember "buang yang tertua" dapat dipakai menghapus status kunci login
- src/lib/security.ts:62-76 (dikombinasikan dengan kunci baru login/route.ts:54-56)
- Kunci `login:acct:<ip>:<identifier>` menaikkan jumlah ember per percobaan. Saat `buckets.size >= 20.000` yang dibuang adalah entri tertua, yaitu ember kunci akun yang sedang diserang. Penyerang dengan banyak IP membanjiri ~20k kunci acak (identifier acak, 3 ember/percobaan) sehingga hitungan `acct`/`acct-any` korban ter-reset dan penebakan jalan lagi.
- Perbaikan: pisahkan Map untuk ember login (batas ukuran sendiri, evict hanya yang kedaluwarsa, tolak percobaan baru dari IP yang membuat terlalu banyak kunci), atau pindahkan ke penyimpanan bersama (Redis/Postgres) dan buang kunci per-identifier yang tidak ada di tabel User sebelum membuat ember.

## LOW

### L1. scrypt N=2^16 melipatgandakan biaya per percobaan login, tanpa pembatas konkurensi
- src/lib/password.ts:18, 27, 33-36; dipanggil src/app/api/auth/login/route.ts:73 (juga untuk akun tak ada lewat dummy hash)
- Tiap percobaan memakan ~64 MiB dan ~4x CPU lama dan berjalan di threadpool libuv (4 utas bawaan, dibagi dengan fs/DNS/zlib). Penyerang dengan banyak IP (IPv6) mengirim login berlebih sehingga threadpool jenuh dan seluruh aplikasi melambat (`mem_limit 2g` masih aman, latensi tidak). Pembatas per-IP 30/15 menit tidak berguna terhadap IP yang berganti-ganti.
- Perbaikan: semafor global untuk scrypt (mis. 2 bersamaan, antrean maksimum lalu 503), `UV_THREADPOOL_SIZE=8` di Docker, batas global login (mis. 20/detik).
- Catatan terkait: tidak ada rehash saat login (password.ts:42-58), jadi 97 hash produksi lama tetap N=16384 selamanya. Usul: bila `parts[1] < SCRYPT_N` dan verifikasi sukses, tulis ulang hash.

### L2. `FOR UPDATE` pada baris induk (Entity/User/Project/Task) menahan sisipan anak (FK KEY SHARE) tanpa rate limit
- src/app/api/access-requests/route.ts:213-215 (paling berisiko: Entity), deadline-proposals/route.ts:121,184, project-stages/route.ts:103, escalations/actions/route.ts:160-164, unlock-requests/route.ts:113-115, src/lib/daily-rollup.ts:214-216 (via syncEvidenceCount)
- `FOR UPDATE` berkonflik dengan `FOR KEY SHARE` yang diambil setiap INSERT anak berFK. Penahanan singkat, tetapi POST /api/access-requests tidak punya rate limit per akun: akun berperan rendah yang boleh mengajukan memanggil berulang (mis. 50/detik) dan menahan baris `Entity` PT-nya sehingga pembuatan laporan harian, tugas, notifikasi PT yang sama menunggu/lambat. Pengajuan `targetUserId` juga menahan baris User korban (update `lastLoginAt` login korban ikut menunggu).
- Perbaikan: ganti ke `FOR NO KEY UPDATE` (tetap menyerialkan penulis tetapi tidak memblokir INSERT anak) atau `pg_advisory_xact_lock(hashtext(...))`; tambahkan `hit()` per user untuk access-requests, deadline-proposals, unlock-requests, evidence link (mis. 30/menit).

### L3. `GET /api/evidence` meneruskan seluruh baris Evidence (storageKey, uploadedById) ke klien
- src/app/api/evidence/route.ts:44 (`{ ...e, url }`); pola sama di tasks/route.ts:258, daily-input/route.ts:221, weekly-input/route.ts:280, progress-reports/route.ts:142 untuk kolom terpilih
- Pada /api/evidence seluruh baris termasuk `storageKey` (jalur objek di bucket, bentuk `TIPE/ID/stamp-rand-nama`) dibocorkan ke setiap peran yang boleh membaca. Bukan eksploit langsung (URL bertanda tangan tetap diperlukan) tetapi membocorkan struktur bucket. Perbaikan: `select` eksplisit (id, fileName, mime, size, url, createdAt).

### L4. `safeEvidenceUrl` diduplikasi tanpa tes sinkron
- src/app/api/progress-reports/route.ts:52 salinan lokal dari src/lib/security.ts (safeEvidenceUrl). Bila salah satu diperketat kelak (mis. blokir IP privat/localhost), salinan lain tertinggal. Perbaikan: impor satu fungsi. Fungsi itu sendiri tidak dapat dilewati untuk javascript:, data:, vbscript:, blob:, kredensial `user@host`, spasi/kontrol awalan (URL parser menormalkan; skema dicek). Tidak ada SSRF karena server tidak pernah fetch URL itu (hanya window.open dengan noopener,noreferrer di klien).

### L5. Ketergantungan keamanan pada header proxy (kontrak operasional, bukan kode)
- src/lib/security.ts:34-55 (clientIp). Aman selama kontainer hanya dijangkau Caddy yang menimpa `X-Real-IP`/`X-Forwarded-For` (deploy/app-vps/monitor-karya.caddy:11-12 memang menimpa). Jika `clientIp` mengembalikan null (header hilang) SEMUA klien berbagi ember `unknown`: 5 kegagalan satu orang mengunci akun itu untuk semua. Perbaikan: gagal-tertutup (tolak/pakai kunci akun saja) bila IP null di produksi; tambahkan tes deploy yang memastikan port 3000 tidak terbuka ke publik.

### L6. PUT /api/admin/report-settings: validasi `workingDays` dan `entityId` longgar
- src/app/api/admin/report-settings/route.ts:48-49, 56-70
- `workingDays` menerima bilangan pecahan (1.5) dan array panjang/duplikat -> galat Prisma 500 atau baris kotor; `entityId` untuk peran global (scopeIds null) tidak dicek keberadaannya (upsert gagal 500 setelah transaksi audit). Dampak: integritas/ketersediaan kecil, hanya Admin PT/TI/Super Admin. Perbaikan: `Number.isInteger`, dedup, maksimum 7 elemen; cek `entity.findUnique` dulu.

## INFO (bukan kerentanan baru / sudah benar)
- Gerbang baru (403 GET report-settings, refusePerformer di entities/[id], blok AKTIF untuk proyek DITOLAK, keputusan eskalasi sekali jalan) hanya MENGETATKAN; tidak ada irisan PIC/KADIV yang melonggar. Pastikan klien PIC/KADIV tidak memanggil /api/entities/[id] (sudah dicek: tab Entitas tidak ada untuk keduanya).
- Kunci waktu bukti harian kini mengikuti ReportSettings (evidence-access.ts:56-62). Dengan produksi 24/7 (cutoff null) laporan hari lampau yang belum diteruskan/dikunci bisa diubah buktinya selamanya; konsisten dengan dailyGate dan keputusan pemilik 10 Okt, tetapi periksa kebijakan retroaktif untuk KPI "tepat waktu".
- `getReportSettings` kini melempar saat DB tidak terjangkau (report-settings.ts:46-58): benar (fail-closed), tetapi pemanggil tanpa try/catch menghasilkan 500 mentah; tidak bocor data.
- evidence/[id] DELETE (route.ts:67-72) masih menghapus objek storage sebelum transaksi DB; jika transaksi gagal baris menunjuk objek hilang (integritas, bukan keamanan).
- Service Worker/luring.html: perubahan mengurangi permukaan (tanpa skrip inline, navigasi tak pernah disimpan, CLEAR_CACHES memasang ulang aset statis saja). Cache `statisHandler` mencakup seluruh `/_next/` bukan hanya `/_next/static`; bila kelak memakai `/_next/image` untuk logo/avatar PT, batasi ke `/_next/static/`.
- Audit log: UPDATE_REPORT_SETTINGS hanya mencatat parameter kebijakan (tidak sensitif). Tidak ada data sensitif baru. Catatan lama: ATTACH_EVIDENCE menyimpan URL penuh dan LOGIN_FAILED menyimpan `identifier` (pengguna sering salah mengetik sandi di kolom username -> sandi tersimpan 64 karakter di targetId), terlihat Auditor/Super Admin; pertimbangkan memasker identifier yang tidak cocok dengan akun.
- Android: `bukaAtauPulihkan` (MkAuthStore.kt:50-60) menghapus sesi + kunci Keystore pada Exception apa pun, termasuk galat sementara; hanya memaksa masuk ulang. Interseptor menambahkan header Cookie manual (MkClient.kt:117) untuk semua host pada redirect; saat ini hanya satu host, tetapi jangan memakai klien ini untuk URL lain. 401 menghapus sesi lokal (benar).
- Migrasi 0032: hanya CREATE/DROP INDEX, aman (tanpa CONCURRENTLY; tabel kecil).
- GitHub Actions (diverifikasi `gh api repos/*/git/ref/tags/*`):
  - actions/checkout v4.4.0 -> 11d5960a... cocok
  - actions/setup-java v4.9.1 -> cf277c60... cocok
  - gradle/actions v4.4.3 -> ed408507... cocok (tag beranotasi menunjuk commit yang sama)
  - actions/upload-artifact v4.6.2 -> ea165f8d... cocok
  - actions/setup-node v4.4.0 -> 49933ea5... cocok
  - actions/setup-python v6.3.0 -> ece7cb06... cocok
  Semua `uses:` sudah dipin; ada blok `permissions:`; tidak ada pull_request_target / secrets.
