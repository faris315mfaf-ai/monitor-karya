# D2 — Sapuan DTO permintaan (entitas, audit, persetujuan, ringkasangrup)

Tanggal: 13 Okt 2026 · Cabang `claude/perbaiki-bug-sisa` · Pemicu: C2 K1 (`AjukanUlangRequest.resubmit` tidak pernah terkirim karena `mkJson` = encodeDefaults=false).

## Metode

1. Semua `@Body` di keempat modul dicacah (11 pemanggilan, 10 kelas DTO).
2. Setiap properti yang punya nilai bawaan dibandingkan dengan cara rute server di `src/app/api/**` membacanya: apakah server membedakan "tidak dikirim" vs nilai bawaan, dan apakah `null`/absen bermakna "kosongkan".
3. Setiap pemanggil (ViewModel/Sheet) diperiksa: nilai apa yang benar-benar diisi.
4. Satu tes JVM per modul (`SandiPermintaanTest`) menyandikan setiap DTO dengan `mkJson` dan memeriksa kunci JSON-nya.

## Tabel keputusan

| Modul | DTO → rute | Medan | Perilaku server | Keputusan |
|---|---|---|---|---|
| entitas | `TambahPerusahaanRequest` → POST `/api/companies` | `isHolding: Boolean = false` | `body.isHolding === true` (absen = false) | **Diubah**: `@EncodeDefault(ALWAYS)`. Kini aman, tetapi medan ini menentukan HOLDING vs PT — jangan bergantung pada bawaan yang dibuang |
| entitas | 〃 | `positions: List = emptyList()` | `Array.isArray(body.positions) ? … : []` | **Diubah**: `@EncodeDefault(ALWAYS)` (kontrak eksplisit) |
| entitas | 〃 | `parentId/code/address/phone/email/website: String? = null` | absen/null → bawaan server (induk HOLDING pertama, kode turunan, null) | Aman; pemanggil (`SheetWizard.keRequest`) memetakan kosong → null |
| entitas | `PosisiBaruRequest` (di dalam `positions`) | `email/password/title/divisionName/projectName: String? = null` | `readPosition`: absen = dibuat server / tanpa tautan | Aman |
| entitas | `UbahPerusahaanRequest` → PATCH `/api/companies` | `address/phone/email/website: String? = null` | `body[k] !== undefined` → ubah; `""` → null (dikosongkan) | Aman: `simpanPerusahaan` selalu mengirim string terpangkas, jadi "" terkirim saat dikosongkan |
| entitas | 〃 | `isActive: Boolean? = null` | `typeof === 'boolean'` | Aman: `false` bukan bawaan, ikut terkirim |
| entitas | `TambahAkunRequest` → POST `/api/companies/users` | `entityId: String? = null` | absen/null/"" = tingkat grup (meja penuh) | Aman |
| entitas | 〃 | `memberDivisionId` | `=== undefined` → tidak diubah | Aman: pemanggil hanya mengisi bila ada perusahaan & terisi |
| entitas | `UbahAkunRequest` → PATCH `/api/companies/users` | `entityId` | `!== undefined` → pindah; ""/null = tingkat grup | Aman: pemanggil mengirim `""` untuk grup, null (absen) untuk meja terbatas |
| entitas | 〃 | `title`, `phone` | `!== undefined` → ubah; "" → null | Aman: pemanggil selalu mengirim string (bisa "") |
| entitas | 〃 | `memberDivisionId` | `!== undefined`; ""/null → lepas divisi | Aman: "" saat dilepas, null saat tidak berubah |
| entitas | 〃 | `divisionId/divisionName/projectId/projectName` | salah satu `!== undefined` → `wantsLink` | Aman, sama dengan web (`account-sheet.tsx` juga mengirim `undefined` bila tidak dipilih) |
| entitas | 〃 | **`email`** | `!== undefined` → ubah; "" → **422** "Email tidak valid." (email tidak bisa dikosongkan) | **Diubah** (bug sukses palsu): isian kosong dulu → null → tidak terkirim → 200 tanpa perubahan, padahal pengguna mengosongkan. Kini `emailUntukUbah(isian, semula)`: kosong + semula ada → `""` (server menolak dengan pesan jelas); kosong + semula null → null |
| entitas | 〃 | `isActive: Boolean?`, `password: String?` | boolean / "" diabaikan | Aman |
| entitas | `TerbitkanAktivasiBody` → POST `/api/companies/users/activation` | `userId` (wajib, tanpa bawaan) | wajib | Aman |
| audit | `PutusanAksesRequest` → PATCH `/api/access-requests` | `decision` (wajib, tanpa bawaan) | bukan approve/reject → 400 | Aman; nilai dari `Putusan.kode` (approve/reject) |
| audit | 〃 | `note: String? = null` | opsional | Aman |
| persetujuan | `KeputusanRequest` → PATCH `/api/approval-requests`, `/api/deadline-proposals` | `action` (wajib, tanpa bawaan) | approve/reject/undo; selain itu 400 | Aman |
| persetujuan | 〃 | `note: String? = null` | wajib untuk reject (≥5 di approval-requests, tidak kosong di deadline) | Aman: UI mewajibkan alasan ≥5 (`MIN_ALASAN`) sebelum menolak |
| persetujuan | `KeputusanProyekRequest` → POST `/api/projects/approve` | `decision` (wajib, tanpa bawaan) | DISETUJUI/DITOLAK, selain itu ditolak | Aman |
| ringkasangrup | `TandaDibacaRequest` → POST/DELETE `/api/ringkasan/laporan-dibaca` | `weeklyReportId` (wajib) | wajib | Aman |
| ringkasangrup | `IngatkanDivisiRequest` → POST `/api/notifications/remind` | `week: String? = null` | absen/null/"" = minggu berjalan | Aman: pemanggil mengisi `kunciMinggu` dari minggu laporan yang tampil |

`UndoRequest` (dipakai `PersetujuanViewModel`) berada di `core/network` dan bukan bagian modul ini, jadi tidak disentuh (wilayah D1).

## Perubahan

- `feature/entitas/.../data/PerusahaanDto.kt`: `TambahPerusahaanRequest.isHolding` dan `positions` diberi `@EncodeDefault(EncodeDefault.Mode.ALWAYS)` + `@OptIn(ExperimentalSerializationApi::class)`; KDoc `UbahAkunRequest` mencatat pengecualian email.
- `feature/entitas/.../perusahaan/PerusahaanLogika.kt`: fungsi murni baru `emailUntukUbah`.
- `feature/entitas/.../perusahaan/PerusahaanViewModel.kt`: `simpanAkun` (edit) memakai `emailUntukUbah(form.email, emailSemula)`.

## Tes baru (semua lulus)

| Modul | Berkas | Tes |
|---|---|---|
| entitas | `src/test/.../entitas/data/SandiPermintaanTest.kt` | 6 |
| audit | `src/test/.../audit/SandiPermintaanTest.kt` | 1 |
| persetujuan | `src/test/.../persetujuan/SandiPermintaanTest.kt` | 2 |
| ringkasangrup | `src/test/.../ringkasangrup/data/SandiPermintaanTest.kt` | 2 |

Gradle (skrip mutex): `:feature:entitas|audit|persetujuan|ringkasangrup:testDebugUnitTest` → BUILD SUCCESSFUL. Total tes modul: entitas 39, audit 35, persetujuan 20, ringkasangrup 38; 0 gagal.

## Catatan untuk pemilik / web

- Web `account-sheet.tsx` selalu mengirim `email` pada PATCH; akun tanpa email yang diedit di web akan kena 422 ("" ≠ null). Android tidak terkena (null tidak dikirim bila akun memang tanpa email). Bukan wilayah D2 — dicatat saja.
