# E2E-SERVER-DIREKTUR — perbaikan BUG-01 (Direktur entitas tidak bisa menyetujui usulan proyek)

Tanggal: 13 Okt 2026 · Cabang: `claude/perbaiki-bug-sisa` (belum di-commit) · Sumber bug: `android/docs/fase3/E2E-2-ADMIN-DIREKTUR.md` BUG-01

## Akar masalah (terverifikasi)

`canSignSlot` (`src/lib/rbac.ts`) memperlakukan kedua slot entitas (`ADMIN_PT`, `DIREKTUR_ENTITAS`) sama:
penandatangan harus `user.scopeEntityId === project.entityId`. Akun direktur di data uji berlingkup
SUB_HOLDING (induk PT), jadi syarat itu tidak pernah terpenuhi. Akibatnya:

- `POST /api/projects/approve` → 403 "Sekarang giliran Direktur entitas di PT pemilik proyek".
- `permissions.approve=false` di `GET /api/projects` → tombol Setujui/Tolak tersembunyi (web dan Android).
- `summary.waiting`, `ringkasan.decisions[].mine`, badge nav `approvals` tidak menghitung usulan itu.
- Rantai PIC/Kadiv/Auditor/Admin PT → Direktur macet selamanya (tidak ada penandatangan lain kecuali TI/Super Admin).

Gerbang baca justru sudah benar: `GET /api/projects` memakai `scopeEntityIds` (PT + keturunan berdasarkan `path`),
sehingga direktur melihat usulan tetapi tidak bisa memutuskannya.

## Semantik yang dipilih

- `docs/fitur/entitas.md`: "Direktur entitas — PT-nya dan semua yang di bawahnya".
- `docs/fitur/arsitektur.md` + `src/lib/oversight.ts` `canDecideApprovalIn`/`decidableWhere`: persetujuan cuti/materi/anggaran
  untuk direktur memakai `scopeEntityIds` (subtree).
- `entityDirectors` (`src/lib/kadiv.ts`) mencari direktur PT itu lalu induk terdekat.

Jadi slot `DIREKTUR_ENTITAS` = boleh ditandatangani direktur yang cakupan `scopeEntityIds`-nya memuat PT proyek.
Slot `ADMIN_PT` tetap PT yang sama persis (keputusan rantai: Admin PT hanya PT-nya). Tidak ada dokumen yang menyatakan sebaliknya.

## Perubahan

| Berkas | Perubahan |
|---|---|
| `src/lib/rbac.ts` | `PROJECT_SUBTREE_SLOTS = ['DIREKTUR_ENTITAS']`; `canSignSlot(user, slot, entityId, reach?)` — `reach` = hasil `scopeEntityIds(user)`. Slot direktur lolos bila PT sama **atau** `reach.includes(entityId)`; tanpa `reach` gagal-tertutup ke PT sama (perilaku lama). Admin PT tidak memakai `reach`. |
| `src/app/api/projects/approve/route.ts` | Teruskan `reach` (sudah dihitung via `scopeEntityIds`). Pesan 403 slot direktur: "…Direktur entitas yang membawahi PT pemilik proyek…". |
| `src/app/api/projects/route.ts` | `format(p, user, reach)` → `permissions.approve`; `summary.waiting` memakai `scopeIds`; respons POST/PATCH ikut. |
| `src/app/api/ringkasan/route.ts` | `decisions[].mine` memakai `scopeIds`. |
| `src/lib/oversight-badges.ts` | Badge `approvals` (pengajuan proyek) memakai `scope`. |
| `src/lib/undo.ts` | `mayUndo` APPROVE/REJECT_PROJECT memakai `scopeEntityIds` — direktur sub-holding bisa mengurungkan keputusannya sendiri. |
| `src/app/api/deadline-proposals/route.ts` | Notifikasi usulan tenggat dikirim ke `entityDirectors(PT)` (PT atau induk terdekat), bukan hanya direktur ber-scope PT persis — pola sama dengan `approval-requests`. |
| `tests/api/direktur-sign-slot.test.ts` | 10 tes baru (unit `canSignSlot`, `POST approve`, `GET /api/projects`). |

Tidak diubah (dicek):
- `approval-requests` (cuti/materi/anggaran): sudah `canDecideApprovalIn`/`decidableWhere` berbasis `scopeEntityIds`.
- `deadline-proposals` PATCH (putuskan): `guardProjectAccess` relasi VIEWER berbasis `scopeEntityIds` — sudah benar.
- `work-desk` `adminDesk`: hanya PT milik akun sendiri; `scopeEntityId === entityId` selalu benar di sana.
- `src/components/preview/mock-proyek.ts` (pratinjau tiruan, di luar kepemilikan): tetap memanggil tanpa `reach` → perilaku lama.

## Peran lain tidak melebar

- PIC/Kadiv/Auditor: tidak punya `project:approve` → selalu false.
- Admin PT: slot Admin PT tetap PT sama persis walau `reach` memuat entitas lain (dites).
- Manajemen/Direksi SDM-GA (slot MANAJEMEN) dan TI/Super Admin: tidak berubah.

## Gerbang

`tsc --noEmit --incremental false` lulus · `eslint src` bersih · `vitest run` **105 berkas / 1.752 tes lulus**.

## Verifikasi nyata (server dev lokal :3100, DB uji 54329)

- `direktur.sh-agro` (SUB_HOLDING, tidak membawahi PT-001): usulan PT-001-PRJ-05 tidak tampil;
  `POST /api/projects/approve` → **403** "…Direktur entitas yang membawahi PT pemilik proyek…".
- `direktur.sh-energi` (SUB_HOLDING induk PT-001): `GET /api/projects?lifecycle=DIUSULKAN` → PT-001-PRJ-05
  `permissions.approve=true`, `summary.waiting=1`; PT-001-PRJ-06 (slot ADMIN_PT) tetap `false`.
  `/api/ringkasan` `decisions` memuat usulan itu (`mine=true`).
- `POST /api/projects/approve` (DISETUJUI) → **200**, lifecycle AKTIF; lalu `POST /api/undo` → 200,
  usulan kembali DIUSULKAN (data uji dipulihkan; tersedia lagi untuk uji Android).

## Catatan

- Bila akun direktur produksi juga berlingkup sub-holding, bug ini memblokir seluruh usulan di produksi (severity KRITIS) —
  perlu deploy setelah commit. Tidak ada akses produksi dilakukan.
- Android cukup mengikuti `permissions.approve`; tidak perlu perubahan klien.
