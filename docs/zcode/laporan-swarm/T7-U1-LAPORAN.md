# T7-U1 — Kehadiran dihapus dari Ringkasan Manajemen; pengajuan proyek dibuka untuk semua peran

Dua keputusan pemilik 9 Okt 2026 diterapkan di cabang `codex/kerja` tanpa commit (sesuai instruksi).

## 1. Kehadiran hilang dari dashboard Manajemen

`src/components/oversight/management-dashboard.tsx`:

- StatTile "Kehadiran" beserta cabang `data.attendance` dihapus; KPI kedua kini selalu "Tepat waktu 30 hari" (fallback tidak dihapus, menjadi satu-satunya).
- Kartu "Kehadiran hari ini" (`AttendanceCard`) dan komponennya ikut dihapus — tampilan kehadiran di Ringkasan Manajemen hilang seluruhnya.
- Kolom `attendance` pada `GET /api/ringkasan` dan `RingkasanData` **tidak** diubah (masih dipakai tes `tests/api/dashboard-ringkasan.test.ts` dan siap dipakai panel lain); ini murni perubahan tampilan.
- CSS `.mk-attbar` di `src/app/css/oversight.css` dibiarkan (kini tanpa pemakai web; berkas CSS zona bersama, hindari konflik agen lain).

Tes `tests/cx/*` tidak mengunci ubin kehadiran Manajemen (grep "Kehadiran/attendance" hanya mengenai API ringkasan dan kehadiran tim kepala divisi), jadi tidak ada asersi KPI yang perlu diubah.

## 2. Pengajuan proyek untuk semua peran

`src/lib/rbac.ts`:

- `'project:propose'` ditambahkan ke `KEPALA_DIVISI` dan `AUDITOR` (peran lain sudah punya; TI/SUPERADMIN via `ALL_CAPABILITIES`).
- `PROJECT_APPROVAL_CHAIN`: `KEPALA_DIVISI` dan `AUDITOR` → `['ADMIN_PT', 'DIREKTUR_ENTITAS']` (pola PIC).
- `ROLE_TABS.KEPALA_DIVISI` mendapat tab `projects` — tanpa ini tombol "Ajukan proyek" takkan pernah terlihat karena ProjectsView hanya terpasang di tab `projects` (`src/components/app-shell.tsx`). AUDITOR sudah punya tab itu.
- Gate UI di `src/components/views/projects-view.tsx` (`mayPropose = can(user.role, 'project:propose')`) dan gate API `POST /api/projects` otomatis mengikuti tabel rbac; `proposalEntity` sudah benar membatasi kepala divisi ke PT-nya sendiri dan auditor (group:read) boleh memilih PT mana pun. Pratinjau (`mock-proyek.ts`) memakai `can()`/`approvalChainFor()` yang sama sehingga ikut berlaku.

Efikasi samping yang dijaga:

- `src/app/api/access-requests/route.ts` — pemeriksaan `isReadOnlyRole` tidak lagi menangkap AUDITOR (kini punya kapabilitas tulis), jadi blokirnya dibuat eksplisit: `user.role === 'AUDITOR' || isReadOnlyRole(...)`. Auditor tetap tidak bisa mengajukan permintaan akses (403 READ_ONLY_MESSAGE, tes `tests/api/admin-access-requests.test.ts` tetap lulus).
- `src/lib/undo.ts` — RESUBMIT_PROJECT bagi pengaju didasarkan kepemilikan (`proposedById`), bukan peran; pengaju-auditor kini sah mengurungkan ajuan ulangnya sendiri. Non-pengaju tetap ditolak (tes baru).

## Penyesuaian tes (tanpa melemahkan pemeriksaan lain)

- `tests/api/auditor-readonly.test.ts` — `projects:POST` masuk daftar ALLOWED dengan alasan keputusan 9 Okt 2026; seluruh route tulis lain tetap wajib menolak auditor (pemeriksaan inventaris dan harness tidak diubah).
- `tests/lib/group-panel.test.ts` — `isReadOnlyRole` kini tak cocok dengan peran dikenal mana pun (AUDITOR punya `project:propose`); asersi "peran tak dikenal dianggap hanya-baca" tetap.
- `tests/cx/access-revocation.test.ts` — it.each auditor-ditolak mengecualikan RESUBMIT_PROJECT; ditambah dua kasus: auditor pengaju boleh mengurungkan ajuan ulangnya sendiri, auditor bukan pengaju tetap 403. Semua aksi undo lain untuk auditor tetap diuji ditolak.

## Dokumentasi

`docs/fitur/matriks-fungsi-peran.md` — dua keputusan 9 Okt 2026 dicatat di bagian "Keputusan yang berlaku untuk semua peran"; baris "Ajukan proyek" ditambah untuk Kepala divisi dan Auditor; baris "Hanya-baca di semua API" auditor diperbarui (pengecualian tunggal `POST /api/projects`); baris Kehadiran Manajemen ditandai dihapus; tab Kepala divisi kini menyebut Proyek.

## Uji wajib (semua lulus)

- `npx vitest run tests/cx tests/security tests/api` → **61 berkas / 1246 tes lulus**, 0 gagal.
- `DATABASE_URL/DIRECT_URL=postgresql://x:y@127.0.0.1:1/db npx tsc --noEmit --incremental false` → nol galat.
- `npx eslint` pada enam berkas yang diubah → lulus tanpa peringatan.

Berkas yang diubah: `src/components/oversight/management-dashboard.tsx`, `src/lib/rbac.ts`, `src/app/api/access-requests/route.ts`, `tests/api/auditor-readonly.test.ts`, `tests/lib/group-panel.test.ts`, `tests/cx/access-revocation.test.ts`, `docs/fitur/matriks-fungsi-peran.md`. Tidak ada commit, tidak menyentuh basis data, tidak menyentuh berkas agen lain (perubahan `android/*` di pohon kerja berasal dari agen lain).
