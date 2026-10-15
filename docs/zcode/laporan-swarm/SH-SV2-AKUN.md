# SH-SV2 — Akun & perusahaan model SUBHOLDING (16 Okt 2026)

Sumber kebenaran: `docs/zcode/KONTRAK-SUBHOLDING-16-OKT.md`. Tanpa git, tanpa DB, tanpa skrip dijalankan.

## Perubahan

| Berkas | Isi |
|---|---|
| `src/lib/companies.ts` | Konstanta `ADMIN_SUBHOLDING_ROLE`, `UNSCOPED_GROUP_ROLES` (SUPERVISOR/KETUA_UMUM/MANAJEMEN), `NEW_MODEL_ROLES`, `SUBHOLDING_DEFAULT_PASSWORD='12345678'`; helper `positionRolesFor`, `roleScopeProblem`, `deskRoles`, `accountEntity` (HOLDING/SUB_HOLDING/PT), `assertSingleSubholdingAdmin`, `subholdingSlug`, `uniqueAccountHandle` (bentrok username/email → `admin.x2`, `admin.x3`…, ≤32), `createSubholdingAdmin`. `isKnownRole` mengenal peran baru; `createAccount` memberi `scopeEntityId=null` untuk peran grup; `readPosition` menerima opsi `subholding`. |
| `src/app/api/companies/route.ts` | POST `type:'SUB_HOLDING'` (atau `isSubholding:true`): induk wajib HOLDING (bawaan holding aktif pertama), kode `SH-<SLUG>`, akun Admin subholding dalam transaksi yang sama; balasan `adminAccount {id, username, defaultPassword}`; AuditLog hanya username. Posisi untuk subholding ditolak 422. PT: induk boleh HOLDING/SUB_HOLDING/SECTOR/REGION; tidak ada akun otomatis (server memang tidak pernah membuat Admin PT otomatis). GET/PATCH/DELETE kini menyertakan SUB_HOLDING; DELETE menghitung `SubholdingReport` sebagai aktivitas. `manageableRoles` + peran baru untuk Super Admin. |
| `src/app/api/companies/users/route.ts` | Entitas akun boleh SUB_HOLDING. POST/PATCH memvalidasi pasangan peran–tempat: ADMIN_SUBHOLDING wajib SUB_HOLDING + satu akun aktif per subholding (POST 422, PATCH 409); SUPERVISOR/KETUA_UMUM/MANAJEMEN tanpa cakupan (holding dinormalkan ke null, PT/subholding 422; ganti peran ke salah satunya melepas cakupan); subholding hanya menampung ADMIN_SUBHOLDING/DIREKTUR_ENTITAS. |
| `scripts/nonaktifkan-peran-lama.ts` | Baru. `--uji` hanya hitung; `--saya-yakin` wajib untuk menulis; tanpa flag/flag asing/keduanya → berhenti sebelum Prisma. Satu transaksi: `isActive=false` PIC_PROYEK+KEPALA_DIVISI aktif, `AuthSession.revokedAt=now`, AuditLog `DEACTIVATE_LEGACY_ROLES` (id/username/peran saja). BELUM dijalankan. |
| `scripts/seed.ts` | Holding = `PT BIKE Tbk`; hapus `SubholdingReportComment`/`SubholdingReport` saat bersih-bersih; akun `admin.karyaenerginusantara`, `admin.karyaagrolestari` (ADMIN_SUBHOLDING), `supervisor`, `ketua.umum`; 16 laporan subholding (hari ini & kemarin, status campuran, bukti tautan untuk semua DISETUJUI, komentar PERBAIKAN/SETUJU/KOMENTAR/BALASAN). Sandi = SEED_PASSWORD; `mustChangePassword=false` untuk ADMIN_SUBHOLDING/SUPERVISOR/KETUA_UMUM/MANAJEMEN. Guard `requireLocalDatabase` tidak diubah. BELUM dijalankan. |
| `tests/api/sh-companies-akun.test.ts` | 15 tes: subholding+admin, bentrok username/email, PT tanpa akun, induk PT, validasi peran baru POST/PATCH, satu admin per subholding. |
| `tests/cx/nonaktifkan-peran-lama.test.ts` | 7 tes: guard flag, mode uji tanpa tulis, tulis satu transaksi + AuditLog, guard sebelum koneksi. |

## Gerbang
- `tsc`: bersih untuk berkas SV2; galat tersisa di `src/app/api/sh/reports/[id]/route.ts` (zona SV1).
- `eslint src scripts`: berkas SV2 bersih; 1 galat `sh-review-view.tsx` (UI) + 1 peringatan `src/lib/subholding/rules.ts` (SV1).
- `vitest`: 1.789 lulus / 6 gagal, semuanya di luar zona SV2: `/api/sh/*` (keamanan-galat-mentah, auditor-readonly — SV1), `statis-sheet` (UI), `t13-login-plafon` (lulus bila dijalankan sendiri; timing).

## Catatan untuk agen lain
- **UI**: `src/components/companies/company-wizard.tsx:75` masih mengisi draf posisi `ADMIN_PT` bawaan — itulah satu-satunya "Admin PT otomatis"; hapus untuk PT, tambahkan pilihan jenis Subholding (`type:'SUB_HOLDING'`, tanpa `positions`) dan tampilkan `adminAccount.username/defaultPassword` sekali.
- **SV1**: helper rbac tidak dibutuhkan; SV2 menulis peran baru sebagai string dan tetap benar bila `ALL_ROLES/ENTITY_ROLES/HOLDING_ROLES` nanti memuatnya. `entityRef` di `src/lib/account-desk.ts` masih hanya HOLDING/PT (dipakai alur permintaan akses) — tidak disentuh.
- Deploy: jalankan `nonaktifkan-peran-lama.ts --uji` lalu `--saya-yakin` setelah migrasi 0034.
