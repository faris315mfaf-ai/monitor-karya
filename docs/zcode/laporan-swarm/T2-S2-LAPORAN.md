# Laporan T2-S2 — Audit keamanan sesi & permukaan serangan

Dikerjakan Zcode (agen T2-S2), 8 Oktober 2026, cabang `codex/kerja`, tanpa commit. Audit internal yang diotorisasi pemilik kode; lingkup baca: AGENTS.md, docs/KEAMANAN.md, docs/codex/CX16-17-AKSES-SESI.md, docs/codex/CX18-AKTIVASI.md, src/proxy.ts, src/lib/{auth,password-policy,security,account-activation,undo,lock,cron-auth,operational-health}.ts.

## Ringkasan

- 1 celah kecil ditambal (guard proxy untuk mutasi ke path `/api` persis), dengan tes.
- 2 temuan sedang dilaporkan tanpa patch (butuh keputusan arsitektur: kepercayaan header proxy, dan pembungkusan transaksi penulis laporan).
- 4 temuan rendah/info dilaporkan dengan usulan.
- 62 tes vitest baru di `tests/security/` (5 berkas awalan `s2-`) semuanya hijau; suite tetangga (proxy, security, session-expiry, activation, undo: 75 tes) tetap hijau. `npx tsc --noEmit --incremental false` bersih untuk berkas yang diubah agen ini.

## Berkas yang dibuat/diubah

| Berkas | Jenis |
| --- | --- |
| tests/security/s2-sesi-token.test.ts | baru — 11 tes |
| tests/security/s2-proxy-csrf.test.ts | baru — 14 tes |
| tests/security/s2-rate-limit.test.ts | baru — 7 tes |
| tests/security/s2-undo-jendela.test.ts | baru — 5 tes |
| tests/security/s2-cron-heartbeat.test.ts | baru — 7 tes |
| src/proxy.ts | patch 1 blok (guard `/api` persis) |
| docs/zcode/laporan-swarm/T2-S2-LAPORAN.md | laporan ini |

`tests/security/otorisasi-lapis.test.ts` adalah milik agen T2-S1; tidak disentuh.

## Skenario yang diuji (semua lulus)

Sesi/token: token rusak (segmen ekstra, tanda tangan dipendekkan/dipindahi, > 2048 karakter, isi tanpa tanda tangan ulang) ditolak tanpa lookup `AuthSession`; token lama tanpa `pv`/`sid` ditolak; `exp` kedaluwarsa ditolak sebelum lookup DB (fail-closed, tanpa kueri percuma); rotasi `AUTH_SECRET` mematikan token lama; logout idempoten (replay token tetap 200, sesi tidak hidup kembali); ganti sandi sukses mematikan perangkat kedua lewat sidik `pv` sementara cookie pengganti dari transaksi langsung berlaku; kontrak cookie dev (`mk_session`, HttpOnly, SameSite=Lax, Path=/, tanpa Secure/Domain) dan produksi (`__Host-mk_session` + Secure, tanpa Domain). Audit gagal saat logout, pencabutan gagal (503 tanpa bocor galat), dan rollback insert sesi pada ganti sandi sudah tercakup tests/cx/session-expiry.test.ts dan tidak diulang di sini.

Proxy/CSRF: Origin dengan port beda ditolak; huruf besar kecil dinormalkan; subdomain `evil.app.test` dan lookalike `app.test.evil.com` ditolak meski `APP_ORIGINS` terisi; parsing `APP_ORIGINS` toleran (spasi, huruf besar, path, port bawaan 443 dinormalkan); `Origin: null` ditolak; tanpa Origin hanya `Sec-Fetch-Site` same-origin/none yang lolos; metode aman (GET/HEAD/OPTIONS) tidak dijaga, PUT/PATCH/DELETE dijaga; mutasi ke `/api` persis kini dijaga; batas badan di nilai batas (tepat 1 MB lolos, +1 byte 413; tepat 21 MB lolos, +1 byte 413; content-length rusak 400; chunked tanpa panjang 411); produksi `/pratinjau` 404 dan CSP ditegakkan (default-src self, frame-ancestors none, form-action/base-uri self, object-src none, tanpa unsafe-eval/ws:) dengan nonce diteruskan ke render; dev hanya Report-Only; 500 nonce tidak berulang.

Pembatas laju: `clientIp` mengutamakan `x-real-ip` lalu nilai PERTAMA `x-forwarded-for` (karakteristik permukaan spoof, lihat temuan 1); pemangkasan 64 karakter; jendela tetap dengan Retry-After terbatas jendela; kunci terpisah antar akun; `resetRate`; banjir 20.100 kunci unik tidak merusak pembatas (prune) tetapi bisa menggeser bucket tertua (blokir hilang); route login — 30 percobaan/IP lalu 429 meski identifier unik, dan karakteristik bypass lewat rotasi nilai pertama XFF (35 permintaan tanpa 429).

Aktivasi (audit baca + tidak diduplikasi dari 32 tes CX18): konsumsi bersamaan, reissue, digest kredensial, token hanya di fragmen, galat teredaksi — semuanya sudah diuji tests/cx/activation.test.ts dan hasil audit ini setuju dengan desainnya; tidak ditemukan celah baru.

Undo: jendela 15 menit di nilai batas (14:59 boleh, tepat 15:00 ditolak); dua `applyUndo` bersamaan menghasilkan tepat satu sukses dan satu audit; replay setelah sukses 409 tanpa audit kedua; kapabilitas dicabut setelah tiket terbit (403 sebelum transaksi); cakupan PT menyempit menolak tiket di luar jangkauan.

Cron/heartbeat: `refuseCron` 503 saat rahasia hilang/pendek, 401 untuk token/skema salah, lolos hanya dengan Bearer penuh; `refuseOperational` 503 untuk rahasia < 32 karakter dan rahasia satu layanan tidak berlaku untuk layanan lain; dua `startJob` menghasilkan baris berbeda dan `finishJob` hanya membarui baris running milik id-nya dalam jendela maxRun; replay `finishJob` tidak bisa mengubah hasil final (sebelumnya `refuseCron` tidak punya tes sama sekali).

## Temuan

### DITAMBAL — celah kecil, patch minimal

**T2-S2-P1 (rendah, penguatan): mutasi ke path `/api` persis lepas guard CSRF dan batas badan.**
Lokasi: src/proxy.ts:101 (sebelum patch: `pathname.startsWith('/api/')`).
Skenario: `POST /api` (tanpa garis miring) masuk cabang halaman — tidak diperiksa Origin/Sec-Fetch-Site dan tidak diperiksa panjang badan. Hari ini tidak ada route di `/api` (404) sehingga dampak nol, tetapi route baru apa pun di akar itu akan lahir tanpa pagar.
Patch: `pathname === '/api' || pathname.startsWith('/api/')` + tes (s2-proxy-csrf). Tidak ada perilaku lain yang berubah; tests/api/proxy.test.ts tetap hijau.

### DILAPORKAN — butuh keputusan arsitektur, tidak dipatch

**T2-S2-S1 (sedang): batas laju per-IP bisa dimutasi lewat nilai pertama `x-forwarded-for`.**
Lokasi: src/lib/security.ts:40-45 (`clientIp`), dipakai src/app/api/auth/login/route.ts:49-53 dan src/lib/account-activation.ts:42-50.
Skenario: di balik Caddy (perilaku bawaan reverse_proxy: XFF ditambah/di-append di belakang nilai klien, bukan ditimpa), klien skrip mengirim `X-Forwarded-For: <acak>`; aplikasi membaca entri pertama → tiap permintaan tampak ber-IP baru. Batas 30/15 menit per IP untuk login dan 20/15 menit per IP untuk konsumsi aktivasi tidak pernah terpicu. Dikombinasikan dengan satu tebakan per akun, batas per akun (5/15 menit) juga tidak terpicu → password spraying / credential stuffing tanpa 429. Di Vercel aman karena `x-real-ip`/XFF ditimpa platform.
PoC (karakteristik, bukan persetujuan): s2-rate-limit "rotasi nilai pertama XFF memutasi batas 30/IP" — 35 permintaan dengan identifier unik dan XFF yang diputar tidak menerima satu pun 429.
Usulan (pilih salah satu, keputusan deploy): (a) baca entri TERAKHIR XFF (ditambahkan proxy terdekat) alih-alih pertama — benar untuk satu hop Caddy dan untuk Vercel (nilai tunggal), gagal-tertutup (menggabungkan) pada rantai proxy; (b) konfigurasi Caddy menimpa XFF (`header_up X-Forwarded-For {remote_host}`) dan aplikasi tetap membaca entri pertama; (c) variabel `TRUST_PROXY_HOPS`. Sekalian: normalisasi IPv6 ke /64 agar rotasi alamat dalam blok tidak memutasi rem.

**T2-S2-S2 (sedang): kunci `FOR UPDATE` penulis laporan harian/task tidak efektif — dipanggil di luar transaksi.**
Lokasi: src/app/api/daily-input/route.ts:348-349 (dan tulis di 376-430), src/app/api/tasks/route.ts:99,329,419,513,609; helper src/lib/daily-rollup.ts:91-97. Pembanding yang benar: src/app/api/inbox/route.ts:123-132 (penerusan, di dalam `db.$transaction`).
Skenario: `lockDailyProject(db, ...)` memakai klien root Prisma — `SELECT ... FOR UPDATE` berjalan sebagai statement tunggal yang autocommit, sehingga kunci baris LEPAS segera setelah statement, sebelum pemeriksaan gerbang `dailyGate` dan tulis dilakukan. Konsekuensi: (a) dua POST bersamaan untuk proyek+hari yang sama sama-sama melihat `existing == null` dan sama-sama membuat — satu kalah di constraint unik `projectId_reportDate` dengan galat tak tertangani (500; ketersediaan, bukan duplikat); (b) TOCTOU integritas: gerbang beku lolos, Admin PT meneruskan laporan (transaksinya mengunci dengan benar dan memasang `forwardedAt`/`isLocked`), lalu tulis PIC (`update` tanpa syarat `forwardedAt`) mendarat di laporan yang sudah dibekukan — tanpa permohonan buka kunci. Jendela kecil, tetapi kunci memang dipasang untuk mencegah tepat ini.
Usulan: bungkus fase tulis handler (`dailyGate` → baca `existing` → update/create → audit) dalam `db.$transaction` dan oper `tx` ke seluruh pemanggilan (pola yang sudah dipakai route inbox); lakukan sama untuk tasks; verifikasi di gerbang integrasi PostgreSQL parent (race unit dengan mock tidak membuktikan lock nyata).
Tidak dipatch karena menyentuh banyak baris di dua route dan di luar mandat "patch minimal"; tidak ada kebocoran data yang bisa didemonstrasikan tanpa DB nyata.

**T2-S2-S3 (rendah): `x-forwarded-host` klien dihitung sebagai host aplikasi.**
Lokasi: src/proxy.ts:33-49 (`expectedHosts`).
Skenario: header ini BUKAN header terlarang di browser, tetapi juga bukan header CORS-safelisted — fetch lintas origin yang menyertakannya memicu preflight dan preflight itu gagal, jadi CSRF berbasis browser praktis tertutup. Sisa risiko: klien non-browser (yang tidak membutuhkan CSRF karena tidak membawa cookie korban) atau deployment di mana proxy depan meneruskan header klien mentah sehingga Origin pilihan penyerang dianggap sah (pertahanan berlapis berkurang).
Usulan: hanya menghormati `X-Forwarded-Host` bila datang dari proxy tepercaya (mis. timpa di edge/Caddy, atau guard dengan daftar host statis `APP_ORIGINS` saja); pertahankan `Host` + `APP_ORIGINS` sebagai dasar.

### DILAPORKAN — info/usulan

**T2-S2-S4 (info): endpoint terautentikasi tanpa pembatas laju.** `/api/evidence/upload` (hingga 21 MB per permintaan, tanpa rem/kuota per akun), `/api/undo`, `/api/escalations/actions`. Semua permukaan TANPA sesi (`login`, `activate`, terbit ulang aktivasi) sudah dibatasi. Usulan bila biaya storage menjadi perhatian: rem per akun ala `limitReminders` untuk unggah.

**T2-S2-S5 (info): batas rem memori.** Banjir > 20.000 kunci unik membuang 1.000 bucket tertua — blokir aktif dapat terhapus (dikarakterisasi di s2-rate-limit); hitungan per instans serverless bukan kuota global (sudah terdokumentasi di docs/KEAMANAN.md §3); baris `AuthSession` kedaluwarsa tidak pernah dibersihkan (pertumbuhan tabel) — usul: pembersihan berkala di cron yang sudah ada (`deleteMany where expiresAt < now - 1 hari`).

**T2-S2-S6 (info, keputusan terdokumentasi): permintaan tanpa Origin dan tanpa Sec-Fetch-Site diteruskan.** Sudah disengaja (docs/KEAMANAN.md §6) untuk klien non-browser; browser yang mengirim POST selalu menyertakan Origin. Tidak diubah.

## Verifikasi yang lolos tanpa temuan

Replay sesi pasca-logout (baris `revokedAt`); sidik `pv` (HMAC hash sandi, 132 bit efektif); perbandingan tanda tangan waktu-konstan dengan cek panjang; `exp` diperiksa sebelum lookup DB; cookie `__Host-` produksi kontrak lengkap (Secure, Path=/, tanpa Domain) vs dev; audit gagal tidak membatalkan pencabutan logout; transaksi ganti sandi (insert sesi gagal → rollback sandi+audit); aktivasi akun sekali pakai (klaim `updateMany` bersyarat + kunci baris User + digest kredensial + token hanya di fragmen + galat teredaksi) — desainnya sejalan dengan 32 tes CX18; undo (klaim atomik, jendela, kapabilitas diperiksa ulang, kunci optimistis `updatedAt`); heartbeat CX20 (klaim bersyarat id+running+ jendela waktu, replay tidak membalik hasil); CSP bernonce tanpa injeksi (nonce 128-bit server-side, unik per permintaan); cron gagal-tertutup; `cleanText`/`contentMatchesMime` (tercakup tests/lib/security.test.ts). Tidak ditemukan server actions (`use server`) di `src/`, jadi tidak ada mutasi yang melewati proxy.

## Perintah uji yang dijalankan

- `npx vitest run tests/security` → 6 berkas, 62 tes lulus (5 berkas `s2-*` milik agen ini + `otorisasi-lapis.test.ts` milik T2-S1).
- `npx vitest run tests/api/proxy.test.ts tests/lib/security.test.ts tests/cx/session-expiry.test.ts tests/cx/activation.test.ts tests/lib/undo.test.ts` → 5 berkas, 75 tes lulus (regresi patch proxy).
- `npx tsc --noEmit --incremental false` (env dummy) → 0 galat pada `src/proxy.ts` dan `tests/security/s2-*`.

## Keterbatasan dan batas pembuktian

- Semua tes memakai mock/`admin-fake-db`; tidak ada PostgreSQL, Supabase, jaringan, atau build produksi yang disentuh. Klaim race (T2-S2-S2) adalah analisis kode + karakteristik semantik autocommit Prisma; pembuktiannya membutuhkan gerbang integrasi DB parent.
- Perilaku Caddy/Vercel atas `X-Forwarded-For`/`X-Forwarded-Host` (temuan S1/S3) disimpulkan dari perilaku bawaan yang terdokumentasi, tidak diuji terhadap proxy sungguhan (dilarang menyentuh kontainer/port yang berjalan).
- Tidak ada pengukuran timing nyata; verifikasi "waktu-konstan" bersifat fungsional (implementasi memakai `timingSafeEqual` atas digest).
- `npx tsc` menampilkan galat tipe di `tests/qa/**` dan `tests/security/otorisasi-lapis.test.ts` — berkas agen lain yang berjalan paralel; tidak disentuh sesuai batas tugas.
- Tidak ada rahasia nyata yang ditulis ke kode, tes, atau laporan ini; nilai rahasia di tes adalah string uji yang jelas.

## Usulan integrasi untuk parent

1. Terima patch proxy `/api` + berkas tes s2 (jalankan `npx vitest run tests/security` di gerbang).
2. Putuskan T2-S2-S1 (arah XFF terakhir vs konfigurasi Caddy menimpa vs `TRUST_PROXY_HOPS`) sebelum deploy di belakang Caddy; di Vercel tidak mendesak.
3. Jadwalkan refaktor transaksi penulis laporan (T2-S2-S2) — route inbox sudah menjadi pola acuan — beserta uji integrasi PostgreSQL.
4. Pertimbangkan pembersihan `AuthSession` kedaluwarsa dan rem unggah bukti per akun (T2-S2-S4/S5).

---

## Addendum parent (integrasi, 8 Okt 2026)

Koreksi atas temuan T2-S2-S2: seluruh handler tulis `daily-input` (PUT/DELETE) dan `tasks` (POST/PUT/PATCH/DELETE) **sudah** berjalan dalam `db.$transaction` — parameter fungsi bernama `db` menyingkirkan klien root, sehingga `FOR UPDATE` memang di dalam transaksi. Bagian race TOCTOU dari temuan ini adalah false positive (salah baca bayangan nama). Yang tetap valid: laporan BARU belum punya baris untuk dikunci, sehingga dua pembuatan bersamaan bisa bertabrakan di constraint unik `(projectId, reportDate)` → P2002 → 500. Tambalan parent: PUT `daily-input` menerjemahkan P2002 menjadi 409 coba-lagi (+2 tes). Temuan T2-S2-S1 (XFF) ditambal parent dengan entri terakhir XFF (+3 tes kontrak/perilaku). Lihat HASIL-TAHAP2-SWARM.
