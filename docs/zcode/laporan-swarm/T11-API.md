# Laporan T11-API — sisa temuan audit T10 di zona API

Agen T11-API, 12 Oktober 2026. Tanpa git, tanpa basis data. Sumber: T10-AUD1-API.md dan T10-AUD4-INFRA.md.

## Diperbaiki

| Temuan | Berkas | Perbaikan |
| --- | --- | --- |
| S-2 | `api/progress-reports` | `summary` 4000, `obstacle`/`followUp` 2000, `status` 32, `projectId`/`id` 64 karakter |
| S-3 (progress-reports) | `api/progress-reports` | Tulis PUT dan hapus DELETE dibungkus try/catch dengan `serverError` |
| R-6 | `api/progress-reports` | P2002 saat simpan bersamaan dibalas 409 |
| S-5 unlock-requests | `api/unlock-requests` | Cek "masih diproses" + create dalam satu transaksi di bawah `FOR UPDATE` baris laporan; konflik 409 |
| S-5 access-requests | `api/access-requests` | Cek duplikat/bentrok diulang di dalam transaksi di bawah `FOR UPDATE` baris pengaju, akun sasaran, atau PT; galat tulis lewat `serverError` |
| S-5 projects | `api/projects` | Kode proyek: create diulang dengan nomor berikutnya saat P2002 (maks 6 percobaan), lalu 409 |
| R-3 | `api/notifications` | `ids` PATCH maks 200 butir, tiap id maks 64 karakter |
| R-4 | `api/daily-reports`, `weekly-reports`, `escalations` | `search` 128, `status`/`statusHeader`/`needed` 32, `entityId` 64 karakter |
| R-5 | `api/project-stages` | Cek MAX_STAGES, posisi, dan create dalam satu transaksi di bawah `FOR UPDATE` proyek |
| R-7 | `api/companies/users` PATCH | `name`/`title` 120 karakter; `phone` memakai regex yang sama dengan `/api/profile` |
| AUD4 login lockout | `api/auth/login` | Kunci kegagalan per (IP, identifier) 5/15 menit; plafon lintas-IP per identifier 100/15 menit. Pemilik sah dari IP lain tidak terkunci oleh penyerang |
| AUD4 evidence url (non-evidence) | `api/progress-reports` GET | Tautan bukti warisan non-http(s) atau berkredensial dinolkan sebelum dikirim |

## Dilewati

- **R-1** (`projects?options=1` memuat daftar PT): `entities` dipakai formulir untuk memilih "PT terkait" lintas PT (`readRelated` memang menerima PT aktif mana pun); isinya hanya id/kode/nama. Menyempitkannya merusak fitur. Bukan bug, keputusan desain.
- **S-3 bagian weekly-input**: milik agen lain.
- **Logout IP** (AUD4): sudah memakai `clientIp` sejak FIX2.
- **evidence/[id] (IP dan validasi skema)**: berkas `evidence/**` dimiliki agen lain. Catatan: `isHttpUrl` ada di `evidence/route.ts`, tidak diekspor.
- Rute tasks/daily-input/weekly-input juga mengirim `evidence.url` mentah di GET; agen pemilik berkas itu perlu menerapkan penyaringan yang sama (pola `safeEvidenceUrl` di progress-reports).

## Uji

- `tsc --noEmit`: bersih. `eslint` pada seluruh berkas ubahan dan tes: bersih.
- Tes baru `tests/api/t11-api-hardening.test.ts` (batas panjang, 409 P2002, 500 tanpa bocor, batas id notifikasi). `tests/api/login.test.ts` disesuaikan (IP tetap) ditambah kasus pemilik sah dari IP lain tetap bisa masuk. `tests/api/pic-world.ts` ditambah tiruan `$queryRaw`.
- `vitest run tests/api tests/security tests/cx tests/lib`: 1404 lulus, 6 gagal. Keenamnya di `tests/api/weekly-input.test.ts` (`db.evidence.groupBy is not a function`): perubahan `weekly-input/route.ts` agen lain (T11-DB) yang mocknya belum diperbarui, bukan dari perubahan ini.
