# Laporan T2-B7 — Skrip pra-rilis satu perintah

8 Oktober 2026, sekitar 11.53 WIB · Cabang `codex/kerja` · Berkas: `scripts/pra-rilis.sh` (baru)

## Ringkasan tugas

Membuat `scripts/pra-rilis.sh`: satu perintah pra-rilis bagi agen/operator lokal yang merangkai gerbang proyek dan gladi rilis ringkas. Bash murni (`set -euo pipefail`), tanpa dependensi baru (hanya node, npx, docker, python3, git yang sudah dipakai proyek). Dua mode: `--cepat` (delapan gerbang tanpa Docker) dan mode penuh default (`--cepat` ditambah build Docker runner+migrate ber-tag `pra-rilis-<timestamp>`, PostgreSQL 17 sekali pakai di port bebas 5460-5469 dengan metadata `storage.buckets` tiruan, `migrate deploy` dua kali, runner sekali pakai di port bebas 3240-3249 dengan `AUTH_SECRET`/`CRON_SECRET` acak per-jalan, cek `/api/health` 200, `/api/health/ready` 200 `ok:true`, `/api/cron/kpi-snapshot` 401, lalu bersih-bersih menyeluruh via trap).

Status: **ditulis dan lulus lokal untuk mode `--cepat`**; **mode penuh belum dieksekusi** sesuai perintah tugas (parent yang menentukan kapan menjalankannya) — hanya diverifikasi sintaks, shellcheck, dan uji terisolasi per fungsi.

## Berkas yang dibuat/diubah

| Berkas | Tindakan |
|---|---|
| `scripts/pra-rilis.sh` | Dibuat (baru, ±470 baris termasuk header komentar bahasa Indonesia) |
| `docs/zcode/laporan-swarm/T2-B7-LAPORAN.md` | Laporan ini |

Tidak ada berkas lain yang diubah. `vendor/braces` tidak disentuh; `git commit`/`add`/`push` tidak dijalankan.

## Perintah uji yang benar-benar dijalankan dan hasilnya

| Perintah | Hasil |
|---|---|
| `bash -n scripts/pra-rilis.sh` | Bersih, tanpa keluaran (sintaks valid) |
| `shellcheck -S warning scripts/pra-rilis.sh` | Bersih — nol temuan level warning ke atas (ShellCheck 0.11.0, `/opt/homebrew/bin/shellcheck`; shellcheck tersedia, tidak perlu pencatatan ketiadaan) |
| `bash scripts/pra-rilis.sh --bantuan` | Keluar 0; header pemakaian tercetak benar |
| `bash scripts/pra-rilis.sh --ngasal` | Keluar 2 dengan pesan argumen tak dikenal |
| `bash scripts/pra-rilis.sh --cepat` (percobaan pertama, 11.43) | **[GAGAL] jujur pada langkah 3 `tsc --noEmit`** — seluruh galat ada di `tests/qa/keyboard/**` dan `tests/security/**`, direktori untracked milik agen lain yang saat itu masih aktif diedit (mtime berubah tiap detik). Skrip mencetak ekor log dan keluar 1; tidak ada sumber daya tertinggal (direktori sementara dibersihkan trap) |
| `bash scripts/pra-rilis.sh --cepat` (percobaan kedua, 11.51, setelah zona agen lain tenang) | **Lulus semua 8 langkah, keluar 0**: `[1] prisma generate (env tiruan) [OK] [2] prisma validate (env tiruan) [OK] [3] tsc --noEmit [OK] [4] eslint src [OK] [5] vitest run [OK] [6] verifikasi vendor/braces [OK] [7] tes dependensi [OK] [8] git diff --check [OK]` |
| Uji terisolasi fungsi port (fungsi diekstrak verbatim dari skrip) | Port terlarang 54339 ditolak dengan pesan; port bebas 5460 terpilih; rentang penuh (dua pendengar sementara di 5461-5462) gagal cepat dengan pesan rentang penuh |
| Uji terisolasi fungsi cek HTTP (server sekali pakai di 127.0.0.1:5469) | 200 diharapkan lulus; status menyimpang terdeteksi; `ok:true` dengan status `degraded` diterima (perilaku CX20); 503 `ok:false` ditolak; koneksi ditolak ditangani tanpa jejak |
| Pemeriksaan sisa | Nol direktori `mk-pra-rilis.*` tersisa di TMPDIR, nol kontainer/jaringan/image `pra-rilis`/`mk-pra-rilis` di Docker, kontainer lain (`monitor-karya-dev-postgres-1`, `simrs-*`, `ruangkerja-*`) tidak tersentuh |

## Desain keputusan

1. **Pemindaian port dengan pengikat sesaat node, bukan `nc`.** `port_bebas` mengikat `127.0.0.1:<port>` sesaat lewat `net.createServer`; gagal berarti terpakai. Hanya memakai node (sudah syarat proyek), berlaku untuk pendengar di alamat mana pun. Rentang kaku: DB 5460-5469, aplikasi 3240-3249; keduanya dipilih sebelum `docker run` pertama sehingga rentang penuh gagal cepat sebelum alokasi apa pun.
2. **Jaring port terlarang eksplisit.** `tolak_port_terlarang` memeriksa tiap kandidat terhadap `54339 3200 3100 3211 54349` dan menghentikan skrip bila menabrak — perlindungan bila rentang suatu saat diedit orang. Rentang sekarang memang terpisah dari kelima port itu.
3. **TOCTOU diakui, bukan disembunyikan.** Ada jendela kecil antara pemindaian dan `docker run`; bila port disita di antaranya, `docker run` gagal terbit dan langkah melaporkan [GAGAL] — kejujuran di atas keajaiban. Komentar di skrip menjelaskan ini.
4. **Nama dan tag berstempel waktu; rahasia acak per-jalan.** `mk-pra-rilis-db-<ts>`, `mk-pra-rilis-app-<ts>`, jaringan `mk-pra-rilis-<ts>`, image `pra-rilis-<ts>` dan `pra-rilis-<ts>-migrate` — dua jalan paralel tidak bertabrakan. `AUTH_SECRET` (32 byte base64url) dan `CRON_SECRET` (24 byte) dibuat baru tiap jalan via `crypto.randomBytes`, tidak pernah dicetak ke log/keluaran.
5. **Trap `bersihkan` di EXIT (+INT/TERM diteruskan ke exit 130/143).** Menghapus kontainer aplikasi dan DB (`docker rm -f`), jaringan, kedua image pra-rilis, dan direktori sementara; semua dijaga `|| true` agar pembersihan tidak pernah gagal dan kode keluar asli terjaga. Dipasang setelah parsing argumen sehingga `--bantuan` tidak menyentuh Docker. Bendera `GLADI_MULAI` hanya terpasang saat sumber daya Docker benar-benar dialokasi (mulai `docker network create`), jadi mode `--cepat` dan kegagalan dini tidak memanggil Docker sama sekali. Cache build sengaja dibiarkan (aman dipakai ulang pekerjaan lain; tidak ada `docker system prune` yang bisa mengganggu).
6. **Menetralkan env warisan.** `unset` di awal untuk `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `CRON_SECRET`, `OPS_HEALTH_SECRET`, `BACKUP_REPORT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `STORAGE_DRIVER` — mewujudkan larangan "jangan menjalankan tes dengan env produksi yang diwarisi shell" (docs/zcode/06) dan jaminan "tidak ada rahasia nyata". Gerbang prisma memakai env tiruan persis tugas: `postgresql://x:y@127.0.0.1:1/db`.
7. **Errexit dimatikan bash dalam kondisi `if` — ditangani eksplisit.** Fungsi langkah dipanggil `if "$@"`, jadi `set -e` tidak berlaku di tubuhnya; setiap fungsi langkah merambatkan kegagalan dengan perintah terakhir yang berarti atau `|| return 1` eksplisit (terutama `naikkan_postgres`, `pilih_port_gladi`, `migrasi_*`, `jalankan_runner`) supaya kegagalan menengah tidak tertutup baris `catat` yang selalu berhasil.
8. **Kesiapan DB via TCP, bukan `pg_isready` socket.** Entripoint resmi postgres menjalankan skrip init (termasuk `storage.buckets`) dengan pendengar socket saja; TCP terbuka hanya setelah init selesai — jadi `tunggu_port_dibuka` + `psql SELECT 1` memastikan skema siap sebelum migrasi. SQL init identik config `storage_metadata_local` di docker-compose.dev.yml.
9. **Migrasi diverifikasi ganda, bukan sekadar exit 0.** Jalanan pertama: keluaran tidak boleh memuat "No pending migrations" DAN jumlah baris `_prisma_migrations` (via `docker exec psql`) harus sama dengan jumlah direktori `prisma/migrations` (dihitung dinamis — saat penulisan 24 termasuk 0029 milik agen lain). Jalanan kedua: keluaran wajib memuat "No pending migrations" (frasa terkonfirmasi pada gladi 8 Okt dengan Prisma 6.19.3 yang sama).
10. **Cron 401 butuh CRON_SECRET terpasang.** `refuseCron` memutus 503 bila rahasia kosong/pendek; karena skrip memasang rahasia acak, permintaan tanpa `Authorization` harus tepat 401. `/api/health/ready` diterima 200 dengan status `degraded` (Storage memang tidak dikonfigurasi — kontrak CX20); yang dipaksa adalah `ok:true`.
11. **Env runner minimal tanpa rahasia nyata:** `DATABASE_URL`/`DIRECT_URL` ke nama kontainer DB di jaringan Docker tertutup, `AUTH_SECRET`/`CRON_SECRET` acak, `APP_ORIGINS=http://127.0.0.1:<port>` tiruan; port DB tetap diterbitkan ke 127.0.0.1 sesuai permintaan tugas, port aplikasi untuk probe HTTP. `.dockerignore` sudah membuang `.env*` dari konteks build.
12. **Satu baris per langkah [OK]/[GAGAL]** dengan anotasi ringkas (port terpilih, jumlah migrasi terpasang, nama kontainer) lewat berkas `info.txt` sementara; log lengkap tiap langkah di direktori sementara dan hanya ekor 40 baris yang dicetak saat gagal.

## Keterbatasan dan batas pembuktian

1. **Mode penuh belum dieksekusi** (larangan tugas; parent menentukan). Yang sudah terbukti: sintaks, shellcheck, seluruh gerbang `--cepat`, jalur [GAGAL] dengan ekor log, penolakan port terlarang, pemindaian port kosong/penuh, helper HTTP pada kasus 200/404/503/koneksi-gagal, pembersihan trap pada mode cepat dan pada kegagalan. Yang belum dibuktikan jalan nyatanya: `docker build` kedua target dari skrip, `docker network/run` gladi, idempotensi migrate dari image, dan tiga probe HTTP terhadap runner sungguhan — logikanya ditulis mengikuti pola gladi 8 Okt (docs/zcode/HASIL-GLADI-RILIS.md) yang terbukti lulus manual.
2. Mode penuh menarik `postgres:17-bookworm` dari registry publik bila belum ada (diizinkan hanya saat mode penuh dijalankan; tidak dilakukan sekarang).
3. Pemindaian port TOCTOU (lihat keputusan 3) — kegagalan tetap jujur dilaporkan, tidak otomatis dicoba ulang.
4. Percobaan `--cepat` pertama gagal di `tsc` karena berkas untracked agen lain yang saat itu masih diedit; percobaan kedua (±8 menit kemudian) lulus penuh. Jadi hasil gerbang pada pohon kerja bersama adalah potongan waktu: agen lain bisa kembali membuat pohon merah setelah laporan ini.
5. Skrip tidak menggantikan checklist operator produksi (A3): Storage nyata, Caddy/HTTPS/WireGuard, cron host, backup, restore offsite tetap di luar jangkauan — dinyatakan juga di header skrip.
6. `npx next build` sengaja tidak ada di gerbang (larangan tugas); build hanya lewat Docker pada mode penuh.

## Usulan integrasi untuk parent

1. Jalankan `bash scripts/pra-rilis.sh --cepat` sekali lagi setelah seluruh zona agen digabung (pohon kerja bersama berubah tiap menit selama swarm berjalan).
2. Jalankan mode penuh (`bash scripts/pra-rilis.sh`) sebagai gerbang konsolidasi rilis bila Docker tersedia; durasi kasar = gerbang cepat + dua build Docker. Pastikan rentang 5460-5469 dan 3240-3249 bebas dari jalan pra-rilis lain (dua jalan paralel dibolehkan — stempel waktu memisahkan sumber dayanya, tetapi rentang port cuma sepuluh per layanan).
3. Bila kelak ingin mode penuh juga menjalankan seed/alur pengguna seperti gladi 8 Okt, itu perluasan tersendiri (guard seed memaksa port/DB tertentu); skrip ini sengaja hanya sampai probe kesehatan.
