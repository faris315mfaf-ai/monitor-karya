# T13 - Tinjauan regresi perubahan belum-commit (gelombang T11/T12)

Tanggal: 12 Okt 2026. Mode baca-saja. Cabang `claude/perbaiki-bug-sisa`, dibanding `codex/kerja`.
Cakupan: 101 berkas terlacak + berkas baru (migrasi 0032, `_paging.ts`, tes, laporan). Pohon kerja berubah
selama tinjauan (125 -> 130 entri `git status`; mis. `cron/reminder-rules`, `remind-divisions` ikut tersentuh),
jadi temuan berlaku pada keadaan sekitar 18.00 WIB.

## Hasil gerbang (dijalankan di pohon kerja)
- `tsc --noEmit`: bersih. `eslint src`: bersih. `vitest run`: 98 berkas / 1.645 tes lulus. `prisma validate`: valid.
- Tes Android (Gradle) dan `next build` TIDAK dijalankan; temuan Android berdasar pembacaan kode.
- SHA GitHub Actions di ci.yml/android.yml dicek lewat tag upstream: cocok (checkout v4.4.0, upload-artifact v4.6.2, setup-python v6.3.0, setup-node v4.4.0, gradle v4.4.3).

## Tidak ada temuan CRITICAL/HIGH

## Temuan MEDIUM

### M1. Celah waktu: pengguna ada vs tidak ada kembali terbedakan di login
- `src/lib/password.ts:22,29` (`SCRYPT_N=65536`) + `src/app/api/auth/login/route.ts:28,75`.
- `getDummyHash()` membuat hash dengan `hashPassword` = N=2^16 (~100 ms di M5; lebih lama di VPS). Semua akun
  produksi yang ada (97) masih berhash N=2^14 (~25 ms) karena TIDAK ada rehash-saat-login. Username salah memakan ~4x
  lebih lama dari username benar + sandi salah. Komentar login (baris 25-27) menyatakan tujuan menyamakan waktu;
  tujuan itu kini rusak.
- Skenario: penyerang mengukur latensi 401 untuk daftar username; yang cepat = akun ada.
- Perbaikan: (a) rehash otomatis ke N baru setelah `verifyPassword` sukses bila N tersimpan < `SCRYPT_N`, dan
  (b) sampai semua terupgrade, buat dummy dengan N hash terlemah (mis. hash konstanta `scrypt$16384$...`),
  atau pilih dummy sesuai N rata-rata. Tambah tes yang membandingkan waktu/parameter dummy vs hash lama.

### M2. Editan akun terblokir oleh validasi telepon baru
- `src/app/api/companies/users/route.ts:172-178`; pemanggil `src/components/companies/account-sheet.tsx:181-195`.
- Form admin mengirim `phone` pada SETIAP PATCH (termasuk saat hanya mengubah peran / menonaktifkan akun).
  Nilai warisan yang dulu tak divalidasi (`0812.3456.789`, `(021) 555-1234`, `+62 812 ... ext 2`) kini gagal regex
  `^\+?[0-9\s-]{8,20}$` -> 422 "Nomor telepon tidak valid", sehingga akun itu tidak bisa diubah/dinonaktifkan sebelum
  admin menebak kolom telepon yang salah (Android memakai PATCH yang sama).
- Perbaikan: validasi hanya bila `phone` BERBEDA dari nilai tersimpan (`existing.phone`), atau terima titik/kurung
  dan normalisasi; tambah tes "PATCH tanpa mengubah telepon warisan tetap 200".

### M3. Laporan harian yang sudah dikirim ikut di-reset saat entri terakhir dihapus/dipindah
- `src/lib/daily-rollup.ts:~150-158` (`resetBilaKosong`), dipakai `src/app/api/tasks/route.ts` put/patch/delete.
- Gerbang hanya menahan laporan `frozen`/`isLocked`/diteruskan. Laporan yang sudah `submittedAt` tetapi belum
  diteruskan (mode 24/7 produksi) tetap bisa diubah PIC; menghapus/memindah entri terakhir kini menimpa
  `status=TIDAK_ADA_PERUBAHAN, progressPct=0, needsEscalation=false` pada laporan yang sudah terkirim ke Admin PT,
  sementara narasi dan `submittedAt` tetap -> Admin PT melihat laporan terkirim "0%, tak ada perubahan" tanpa
  jejak audit khusus. Juga memadamkan flag eskalasi diam-diam.
- Perbaikan: terapkan reset hanya bila `!existing.submittedAt` (atau catat audit + kembalikan ke draf), dan jangan
  menyentuh `needsEscalation` bila ada eskalasi terbuka. Tes: laporan submitted + hapus entri terakhir.

### M4. KPI/kepatuhan: aturan SAAT INI dipakai surut, dan produksi (workingDays kosong) mewajibkan Sabtu-Minggu
- `src/lib/kpi-snapshot.ts:~44-51` (`workdaysBetween(start, lastDay, rpt.workingDays)`, `dailyDeadlineWith`),
  juga `kadiv.ts` (`lockedWorkdays(..., rpt.workingDays)`), `reminder-rules.ts`, `my-dashboard`.
- Produksi: `workingDays = []` ("setiap hari"). Sebelumnya KPI memakai Sen-Jum. Sekarang pembagi "hari wajib lapor" bulan
  berjalan DAN bulan lalu (snapshot dihitung ulang) naik ~40%; PIC yang tak lapor akhir pekan tampak turun
  (mis. 22/22 -> 22/31 = 71%) tanpa perubahan perilaku. Komentar kode mengakui "belum ada riwayat perubahan settings".
  Keputusan pemilik 10 Okt ("24/7 = boleh isi kapan saja") tidak sama dengan "wajib lapor tiap hari".
- Perbaikan/konfirmasi: tanyakan pemilik; bila hanya "boleh", pisahkan `workingDays` (wajib) dari izin isi, atau
  untuk KPI pakai Sen-Jum saat `workingDays` kosong. Jangan hitung ulang snapshot bulan lalu dengan aturan baru.

## Temuan LOW

- L1. Plafon kunci akun lintas-IP 100/15 mnt (`auth/login/route.ts:23,55-62`) melonggarkan batas penebakan terdistribusi
  ~20x dibanding 5/15 mnt sebelumnya (dengan 5 IP x 5 percobaan sudah 25). Trade-off DoS-vs-brute-force disengaja,
  tetapi pastikan kebijakan sandi cukup kuat; tes hanya mencakup satu IP.
- L2. `access-requests/route.ts` (transaksi `FOR UPDATE` User pengaju lalu User sasaran): dua pengajuan silang
  (X untuk akun Y dan Y untuk akun X) mengunci berlawanan -> deadlock Postgres -> 500 salah satunya. Kunci berurutan
  menurut id (`ORDER BY id`) atau satu `SELECT ... WHERE id IN (...) ORDER BY id FOR UPDATE`.
- L3. scrypt N=2^16: throughput login dibatasi threadpool libuv (4 utas x ~100-250 ms, 64 MiB/hash). Cukup untuk 97 akun;
  bila diserang dari banyak IP (30/IP) pemakaian threadpool juga menahan fs/DNS proses. Pertimbangkan `UV_THREADPOOL_SIZE`
  dan batas konkurensi login. Tes `password-scrypt` kasus "N di luar batas" tautologis (kedua jalur jatuh ke N lama).
- L4. `evidence/[id]` DELETE: objek storage dihapus sebelum transaksi DB; bila transaksi gagal baris menunjuk objek hilang
  (sudah jadi pola lama, kini jendelanya sama; hanya dicatat).
- L5. Tes transaksi/kunci (`eskalasi-atomik`, `t12-api-baru`, ...) memakai `$transaction` lewat-saja dan `$queryRaw`
  kosong: urutan kunci Project -> DailyProjectReport, P2025 sungguhan, dan kebuntuan TIDAK teruji. Analisis manual saya:
  `syncEvidenceCount(tx)` mengunci Project lalu laporan (benar); eskalasi/buka-kunci hanya mengunci satu baris
  (laporan/Task/Item) tanpa meraih Project sesudahnya -> tidak ada siklus yang ditemukan. Perlu 1 tes integrasi
  pada DB Docker terisolasi (port 54361+) bila ingin bukti.

## Diperiksa dan dinyatakan aman
- Migrasi `0032_indeks_bukti_buka_kunci`: idempoten (`IF NOT EXISTS`/`IF EXISTS`), hanya indeks, nama sama dengan
  konvensi Prisma untuk `@@index([targetType, targetId])` pada Evidence/UnlockRequest; `ReportSettings_entityId_idx`
  memang dibuat di 0030 dan `ReportSettings_entityId_key` (unik) tetap melayani. Catatan kecil: `CREATE INDEX` tanpa
  CONCURRENTLY menahan tulis Evidence sesaat (tabel kecil, bisa diterima).
- scrypt: verifikasi membaca N dari string hash, r=8,p=1 sama dengan kode lama -> hash lama (N=16384) tetap valid; `maxmem`
  cukup; batas N 1024..2^18 pangkat dua.
- Kunci eskalasi: `Task`/`DailyProjectReport`/`WeeklyReportItem` tanpa `@@map` -> nama tabel SQL benar. `update({where:{id,status}})`
  lolos tsc (extendedWhereUnique), P2025 -> 409.
- Android: `reportDate=tanggalMeja` cocok DTO `SimpanLaporanRequest` (nullable); interceptor sesi tidak memicu pada
  `/api/auth/login`; `/api/profile/password` salah-sandi = 422 (bukan 401) sehingga tidak ikut memutus sesi;
  `countdown` nullable cocok dengan server 24/7; `hapusTersinkronLamaHari` kolom `tanggalKerja` memakai
  `Wib.keEpochMillis` yang sama dengan penyimpan.
- Perubahan status HTTP: eskalasi putus ulang 409, `report-settings` GET 403 untuk peran non-Admin PT/TI/SuperAdmin
  (satu-satunya pemanggil `statistik-view`), `entities/[id]` 403 untuk PIC/Kadiv (tab tidak ada), `evidence/[id]` link tak aman 422,
  proyek DITOLAK->AKTIF 400-an lewat PATCH. Tidak ada klien Android yang memanggil endpoint-endpoint itu dengan kontrak lama
  kecuali `evidence/{id}` (422 dipetakan ke `Validasi`) dan `companies/users` PATCH (lihat M2).
