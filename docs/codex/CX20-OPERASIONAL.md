# CX20 — Kesiapan operasional

Pembaruan integrasi parent: build Next/runner Docker final dan gerbang aplikasi lulus; hasil, bukti HTTP/PostgreSQL, serta batas produksi tercatat pada [CX16–20](CX16-20-HASIL.md). Catatan tahapan di bawah mempertahankan konteks verifikasi agen.

Tanggal: 7 Oktober 2026. Zona agen operasional pada `codex/kerja`; tanpa commit,
push, deploy, perubahan skema, atau akses Supabase/server. Mengikuti panduan
Route Handlers dan route.js dari `node_modules/next/dist/docs/` lokal.

## Kontrak endpoint

| Endpoint | Akses | Arti hasil |
|---|---|---|
| GET `/api/health` | Publik | 200 `alive`; hanya proses HTTP hidup, tanpa kueri DB/storage |
| GET `/api/health/ready` | Publik | `SELECT 1` wajib berhasil; DB gagal/timeout → 503 `unavailable`; DB sehat → 200 `ready` atau `degraded` bila storage gagal |
| GET `/api/health/internal` | Bearer `OPS_HEALTH_SECRET` | 200 hanya jika DB, storage, dan empat pekerjaan sehat; lainnya 503 dengan status komponen tetap |
| POST `/api/health/backup` | Bearer `BACKUP_REPORT_SECRET` | Merekam tahap backup, bukan menjalankan backup |

Semua respons `Cache-Control: no-store`. Endpoint publik hanya mengembalikan
status agregat; rincian heartbeat/storage dilindungi rahasia. Rahasia salah → 401;
rahasianya belum disetel/minimal belum terpenuhi → 503 generik. Tidak ada sesi
pengguna/AuthSession yang diperlukan. `CRON_SECRET` tetap untuk tiga route cron.
Caddy menolak endpoint cron serta dua endpoint health privat dari internet.

**Readiness tidak lagi memakai `/login`.** Dockerfile dan Compose memakai
`/api/health/ready`, memeriksa HTTP 200 serta JSON `ok === true`, menolak redirect,
dengan timeout permintaan 7 detik dan timeout healthcheck 10 detik. Menurunnya
storage tidak membuat proses aplikasi dianggap mati, tetapi monitor operasional
akan gagal. `SELECT 1` membuktikan koneksi, bukan kelengkapan skema atau semua hak
akses tabel; jalankan pemeriksaan migrasi dan alur aplikasi secara terpisah.

## Probe penyimpanan sungguhan

Probe membaca objek kecil yang sudah dipersiapkan operator. Tidak mengunggah,
menghapus, ataupun menyentuh bukti pengguna. Status privat `checks.storageStatus`:

- `ok`: GET berhasil dengan HTTP tepat 200 dan isi objek cocok persis.
- `configmissing`: konfigurasi driver wajib tidak tersedia/tidak valid menurut pemeriksaan konfigurasi driver.
- `degraded`: konfigurasi tersedia, tetapi request/izin/status/isi objek gagal atau timeout.

Objek: `evidence/_health/readiness.txt` pada Supabase; pada S3 gunakan bucket dari
`S3_BUCKET` dan key yang sama `_health/readiness.txt`. Isi UTF-8 tepat
`monitor-karya-storage-v1`, **tanpa newline**. Buat objek privat melalui prosedur
operator. Jangan menganggap file lokal berarti objek sudah diunggah.

Supabase menggunakan GET terautentikasi ke
`/storage/v1/object/authenticated/evidence/_health/readiness.txt` dengan service
role server. S3 memakai URL GET bertanda tangan dari implementasi S3 yang ada,
lalu benar-benar mengambil isinya. URL bertanda tangan tidak dikembalikan dalam
respons/log baru. Redirect ditolak; isi dibatasi 128 byte; timeout 4 detik.
Menerima halaman login HTTP 200, 404, objek kosong, atau teks salah tetap gagal.
Probe baca **tidak membuktikan izin unggah/hapus**; uji alur bukti terpisah.

Konfigurasi fixture HTTP lokal untuk integrasi parent (bukan layanan produksi):

```dotenv
STORAGE_DRIVER=supabase
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:PORT_FIXTURE
SUPABASE_SERVICE_ROLE_KEY=offline-fixture-key
```

Fixture harus melayani path di atas dengan HTTP 200 dan isi tepat. Pasangkan
`DATABASE_URL` ke DB lokal yang diotorisasi; tanpa fixture, DB sehat tetap 200
`degraded`. `/api/health/internal` tetap 503 hingga storage serta semua heartbeat
tersedia. Untuk fixture dalam Docker, `127.0.0.1` berarti kontainer itu sendiri;
gunakan alamat fixture pada jaringan lokal Docker yang tepat.

## Rahasia dan jadwal

Tambahan pada env aplikasi (nilai contoh hanya `GANTI`, tidak dapat digunakan):
`OPS_HEALTH_SECRET` dan `BACKUP_REPORT_SECRET`, masing-masing minimal 32 karakter
acak, berbeda dari satu sama lain dan `CRON_SECRET`. Pertahankan env yang sudah
ada. Berkas env/chmod 600; jangan taruh nilai rahasia dalam argumen CLI, crontab,
URL, atau dokumen. Tidak ada dependensi npm baru dari zona operasional. Dockerfile menyalin `vendor/` sebelum `npm ci` agar dependensi lokal yang disiapkan agen dependensi tersedia saat build.

| Pekerjaan tetap | Jadwal operator WIB | Kedaluwarsa | Maksimum berjalan |
|---|---|---|---|
| reminder-rules | Tiap 30 menit, sepanjang hari, termasuk akhir pekan | 90 menit | 10 menit |
| remind-divisions | Hari kerja 09.00 | 74 jam, mencakup akhir pekan | 10 menit |
| kpi-snapshot | Harian 17.30 | 26 jam | 10 menit |
| backup | Harian 01.15 | 30 jam | 6 jam |

`cron.sh` kini mendokumentasikan jadwal sepanjang hari untuk reminder-rules.
Aturan pengingat tetap menentukan jam/hari WIB sendiri; housekeeping akses dan
buka kunci tetap berjalan. Operator harus memperbarui jadwal lama 07–18/hari
kerja atau monitor akan melaporkan stale di malam/akhir pekan. Tidak ada crontab
yang dipasang dalam tugas ini.

Heartbeat memakai AuditLog yang ada (`targetType=OPERATIONAL_JOB`, `targetId`
job tetap). Satu baris per run dibuat sebagai `OPS_RUNNING`, kemudian diubah
kondisional menjadi `OPS_SUCCESS`/`OPS_FAILURE`. `at` tetap waktu mulai dari DB;
penyelesaian run lama tidak membuatnya lebih baru daripada run lain. Tidak ada
teks galat, URL, token, atau timestamp masukan pengguna dalam heartbeat. Nilai
status/identitas run bukan bukti restore backup.

Job tidak dimulai bila heartbeat awal gagal disimpan. Kegagalan terminal atau
parsial menghasilkan HTTP 503. KPI parsial tidak lagi HTTP 200 `ok:false`;
cron runner juga memeriksa JSON `ok`, tidak hanya status HTTP. Aturan pengingat
yang menelan galat internal dideteksi dengan membandingkan himpunan aturan yang
jatuh tempo dengan hasil eksekusi. Lookup aturan divisi dilakukan tanpa fallback, sehingga pembacaan tabel aturan
yang gagal tidak dilaporkan sukses. Skip akhir pekan yang dipanggil secara sah tetap sukses.

Status `missing`, `failure`, `stale`, `stalled`, dan `invalid` membuat monitor
gagal. `running` hanya sehat jika hasil terminal terbaru sukses dan masih segar;
memulai ulang pekerjaan gagal tidak langsung membuat status hijau. Tidak ada
perubahan skema/migrasi 0029 yang diperlukan. Untuk volume AuditLog besar,
parent/operator dapat mempertimbangkan indeks `(targetType, targetId, at)` lewat
migrasi terpisah; kueri tetap dibatasi timeout dan gagal tertutup jika lambat.

## Hook backup dan pemantau

Pasang `report-backup.py` **di sebelah** skrip backup terpasang, misalnya
`/usr/local/sbin/report-backup.py` bila backup di `/usr/local/sbin/pg-backup`.
Host backup membutuhkan Python 3 stdlib dan GNU `timeout` (Ubuntu/coreutils),
selain perkakas backup lama. Jangan menjalankan instalasi pada mesin pengembangan.
Konfigurasi environment milik job backup, dari berkas privat yang dibaca wrapper:

- `BACKUP_REPORT_URL`: URL tetap berakhir `/api/health/backup`, tanpa query atau kredensial URL.
- `BACKUP_REPORT_SECRET_FILE`: berkas biasa milik pengguna pelaksana, izin 600/400, berisi rahasia yang sama dengan `BACKUP_REPORT_SECRET` aplikasi (32–256 karakter tanpa spasi).
- `BACKUP_REQUIRED_DATABASE`: nama DB aplikasi yang harus ada pada inventaris dump; wajib bila laporan diaktifkan.

Gunakan tunnel loopback SSH yang dikelola operator dari VPS DB ke aplikasi, atau
endpoint HTTPS privat yang diatur operator. HTTP hanya diizinkan untuk localhost;
HTTP jarak jauh ditolak. Caddy publik **sengaja memblokir** endpoint laporan, jadi
URL domain publik standar tidak cukup. Jangan mempublikasikan port aplikasi
hanya untuk hook ini. Penyiapan tunnel dan pengawasannya belum dilakukan.

Hook mengirim hanya `{status, runId}` (UUID v4) untuk `running`, lalu `success`
atau `failure`. Server membatasi body 256 byte dan 4 detik, hanya menerima field
tersebut. Penyelesaian memerlukan run `running` yang belum melewati 6 jam.
Laporan terminal ganda/terlambat/tanpa awal ditolak 409; ID awal ganda tidak
menimpa run yang ada. Redirect/proxy lingkungan di klien ditolak; batas isi
respons 1 KiB; timeout socket 10 detik dan batas proses 15 detik.

Kegagalan pelaporan awal **tidak menghentikan upaya backup**. Trap EXIT mencoba
laporan terminal jika awal sudah diterima. Exit asli `pg_dump`/`age`/`rclone`
tetap dipertahankan walaupun pelaporan juga gagal. Jika backup berhasil tetapi
pelaporan gagal, exit 70. Tanpa konfigurasi laporan, backup lama masih berjalan,
tetapi status internal tetap missing/stale. Inventaris kosong atau tidak memuat
DB yang diwajibkan tidak dilaporkan sukses. Sukses berarti skrip dump/enkripsi/
checksum/copy berhasil; retensi remote tetap best-effort seperti sebelumnya.

Jalankan `deploy/app-vps/monitor.sh` tiap 5 menit dari host aplikasi (contoh pada
kepala skrip). Ia mengambil status melalui `docker exec`, memakai rahasia env
kontainer, lalu keluar **0** hanya bila semua komponen sah/sehat; kegagalan keluar
**1** dengan tindakan yang perlu diperiksa. Skrip tidak mengirim notifikasi
email/chat/layanan luar. Hubungkan exit nonzero ke pemantau milik operator nanti.
Nama kontainer mengikuti Compose yang ada; sesuaikan bila nama proyek diubah.

## Bukti pengujian dan batasan

- 75 tes pada `tests/cx/operational-health.test.ts` dan `tests/cx/operational-scripts.test.ts` lolos: DB/fetch tiruan, timeout, kegagalan parsial, kerahasiaan respons, status kedaluwarsa, heartbeat, validasi report, exit backup, monitor gagal tertutup, dan reporter HTTP loopback.
- Tes backup mengganti seluruh perintah DB/enkripsi/offsite dengan fixture lokal; tidak menjalankan backup nyata. Tes reporter memakai listener loopback sementara dan nilai rahasia tiruan.
- ESLint zona baru, `bash -n` tiga skrip, serta `git diff --check` lolos.
- TypeScript integrasi (`npx tsc --noEmit`) lolos setelah model AccountActivation tersedia. Parent menjalankan ulang gerbang integrasi dan build pada pohon final.
- Build image/runtime, storage Supabase/S3 nyata, WireGuard/tunnel, cron server, offsite copy, dan restore backup **belum diuji** oleh agen ini. Tidak ada layanan eksternal/DB produksi yang diakses.

Batas timeout Prisma membatasi waktu respons, **tidak membatalkan kueri server**;
setel `connect_timeout`, `pool_timeout`, dan statement timeout PostgreSQL sesuai
operasional. Pembatas waktu pekerjaan juga tidak menggulung balik efek yang
sudah terjadi atau membatalkan promise; run macet tetap gagal/stalled. Belum ada
lease/lock terdistribusi untuk mencegah dua pemicu cron bersamaan. Preflight aturan
bisa menghasilkan failure konservatif bila konfigurasi berubah saat cron sedang
berjalan; retry berikutnya akan mengevaluasi keadaan terbaru. Readiness berbagi
probe yang sedang berlangsung per proses, tanpa menyimpan cache hasil sukses.
