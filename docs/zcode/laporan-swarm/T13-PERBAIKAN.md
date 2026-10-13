# T13 - Perbaikan temuan tinjauan regresi dan keamanan

Tanggal: 12 Okt 2026. Tanpa git/DB/prisma generate/migrate. Gerbang: `tsc` bersih, `eslint src` + tes baru bersih, `vitest run` 101 berkas / 1.701 tes lulus (+38 tes).
Keputusan pemilik dipertahankan: `workingDays: []` = setiap hari.

## (a) Regresi

| Temuan | Status | Tindakan |
| --- | --- | --- |
| M1 hash tiruan login | Diperbaiki | `verifyPasswordUniformCost` (`src/lib/password.ts`): hash bernilai N < N sekarang ditambah putaran scrypt pembuang (maks 16) sehingga biaya total ~ satu hash N=65536; akun-ada/sandi-salah, akun-tidak-ada (dummy N baru) dan sandi-benar kini sebanding. Rehash-saat-login SENGAJA tidak dipakai: sidik sandi sesi (`pv`) berasal dari hash, jadi rehash memutus semua sesi lain pemilik akun (web dan Android). Tes mengukur rasio waktu. |
| M2 telepon PATCH akun | Diperbaiki | `companies/users` PATCH memvalidasi format hanya bila `phone` berbeda dari nilai tersimpan; nilai warisan yang dikirim ulang tidak diubah dan tak memblokir peran/nonaktif. |
| M3 reset laporan terkirim | Diperbaiki | `daily-rollup` `resetBilaKosong` hanya untuk draf (`!submittedAt`); laporan terkirim hanya dihitung ulang `evidenceCount`. Flag eskalasi tidak dipadamkan bila ada Escalation DAILY_REPORT terbuka (DIAJUKAN/DITINJAU). |
| M4 KPI workingDays kosong | Bukan bug, didokumentasikan | KPI, kadiv-math, reminder-rules, my-dashboard, dailyGate semuanya memakai satu sumber (`isWorkingDayWith` / `workdaysBetween(..., workingDays)`), `[]` = setiap hari, PT berhari Sen-Jum tidak punya kewajiban akhir pekan (tes sudah ada di `t12-jam-bukti`). Komentar eksplisit ditambah di `kpi-snapshot.ts` termasuk caveat: aturan SAAT INI dipakai surut untuk bulan lalu yang dihitung ulang (belum ada riwayat settings). Tidak diubah. Sisa kisi tampilan 10 hari Sen-Jum (`lastWorkingDays`) di compliance/kadiv tetap tampilan, bukan penegakan. |
| L2 deadlock access-requests | Diperbaiki | Pembantu `lockRequestRows` (`src/lib/access-requests.ts`): dua baris User dikunci menurut id terurut; `FOR NO KEY UPDATE` untuk User dan Entity. Tes memeriksa urutan pengajuan silang identik. Tes urutan Project -> DailyProjectReport pada `rollupDailyReport` juga ditambahkan. |
| L1 plafon 100/15 | Digantikan oleh M1 keamanan | Lihat (b). |
| L3 threadpool scrypt | Dilewati | Operasional (`UV_THREADPOOL_SIZE`, semafor login) bukan perbaikan kode kecil; dicatat sebagai saran. Tes "N di luar batas" tautologis: dibiarkan. |
| L4 hapus objek storage sebelum transaksi | Dilewati | Pola lama, dicatat peninjau tanpa tindakan. |
| L5 tes kunci | Sebagian | Tes urutan panggilan kunci ditambah; tes integrasi DB Docker tidak dikerjakan (larangan menyentuh DB). |

## (b) Keamanan

- M1 plafon lintas-IP (`auth/login/route.ts`, `auth.ts`): plafon turun ke 30 dan tidak lagi memblokir pemilik sah. Setelah terlampaui, hanya perangkat yang membawa cookie `mk_device` (HMAC, HttpOnly, 90 hari, terikat sidik kata sandi akun sehingga ganti sandi mencabutnya) yang diproses; selain itu 429 SEBELUM sandi diperiksa (penyerang tak mendapat sinyal benar/salah; akun tak ada dijawab sama). Login sukses tidak lagi menghapus hitungan lintas-IP (satu login sah dulu memberi penyerang 30 tebakan baru). Catatan: klien tanpa cookie (aplikasi Android) bisa tertahan selama serangan aktif, hilang sendiri dalam 15 menit; mengubah klien Android di luar kepemilikan.
- M2 eviction (`security.ts`): ember menyimpan `limit`; urutan buang: kedaluwarsa, lalu ember tak terkunci (hitungan terkecil dahulu, lalu tertua), baru yang terkunci tertua hanya bila semuanya terkunci. Banjir kunci acak tidak lagi menghapus kunci aktif maupun hitungan korban. Tes lama S2 "bucket tertua terhapus" disesuaikan.
- L5 `clientIp` null: tidak ada ember "unknown" bersama; batas per-IP dilewati (batas per-akun tetap), peringatan dicatat sekali.
- L2 `FOR NO KEY UPDATE`: diterapkan pada rute paling berisiko (access-requests POST: User dan Entity). Kunci Project/laporan lain (daily-rollup, deadline-proposals, project-stages, unlock, escalations) dibiarkan `FOR UPDATE`: penahanan singkat dan tes yang ada mengecek string `FOR UPDATE`; bisa diganti terpisah.
- L4 duplikasi `safeEvidenceUrl`: salinan lokal di `progress-reports` dihapus, memakai `lib/security`.
- L6 `report-settings` PUT: `workingDays` harus bilangan bulat 1-7 (ISO, bukan 0-6 seperti tertulis di tinjauan: seluruh kode memakai ISO 1..7), unik, maks 7, kosong tetap sah; nilai ganjil 422 (dulu disaring diam-diam / 500). `entityId` peran global dicek keberadaannya (404).
- L3 `storageKey` ke klien: DILEWATI. `EvidenceItemDto` Android (`DtosFase1.kt`) mewajibkan `storageKey` non-null; menghapusnya merusak deserialisasi `GET /api/evidence`. Saran: ubah DTO Android jadi opsional dulu, baru `select` eksplisit di `evidence/route.ts`.

## (c) Kunci mingguan

- `api/tasks`: `lockCheck` (memakai `gate.settings`), GET papan mingguan (`locked`, `lockAt`), dan PATCH susun papan kini memakai aturan PT proyek (`isWeeklyLocked(..., settings)`); pesan 409 lewat `weeklyLockedMessage` (ditutup / "Jumat 15.00 WIB" / cadangan env). Tanpa batas jam = tidak terkunci.
- `kadiv/weekly-summary` dan `lib/kadiv.ts` `buildWeeklySummary`: tenggat dari `weeklyDeadlinesWith(date, settings)`; `lockAt` tampilan = jam PT, penegakan (`effectiveLockAt`) = ditutup terkunci sejak awal minggu, tanpa batas jam berakhir di pergantian minggu.
- Pembantu baru di `lock.ts`: `weeklyDeadlinesWith`, `weeklyLockedMessage`.
- Tidak disentuh (butuh keputusan lintas-PT): `oversight.ts`, `system/grup`, `ringkasan`.

## Tes baru
- `tests/api/t13-perbaikan.test.ts` (26): telepon warisan, rollup reset, urutan kunci, validasi report-settings, kunci mingguan tasks, tenggat mingguan.
- `tests/security/t13-login-plafon.test.ts` (12): plafon lintas-IP + cookie perangkat, sukses tak mereset, IP null, eviction, biaya waktu hash lama vs baru.
