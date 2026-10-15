# SH-PINDAH-PT — Pindahkan PT ke subholding (16 Okt 2026)

Masalah: di produksi PT lama berada langsung di bawah HOLDING (PT BIKE Tbk); model
subholding (`docs/zcode/KONTRAK-SUBHOLDING-16-OKT.md`) butuh PT di bawah SUB_HOLDING.
PATCH `/api/companies` sebelumnya tidak bisa mengubah `parentId`. Tanpa git, tanpa DB/server.

## Perubahan

| Berkas | Isi |
|---|---|
| `src/lib/companies.ts` | `MOVABLE_ENTITY_TYPES` (PT/SECTOR/REGION), `MOVE_PARENT_TYPES` (HOLDING/SUB_HOLDING/SECTOR/REGION), `EntityMoveError` (status 404/409/422), helper murni `lastPathSegment`, `childPath`, `rebasePath`, dan `moveEntity(tx, { id, parentId })`. |
| `src/app/api/companies/route.ts` | PATCH menerima `parentId` → `patchWithMove`: satu `$transaction` berisi pindah + perubahan identitas lain (nama, status, dll.) + AuditLog. Jawaban `{ ok, entity, moved, from, to, descendants, subholdingReports: { kept, open } }`. Tanpa `parentId` perilaku lama tidak berubah. |
| `src/components/companies/move-company-sheet.tsx` (baru) | Sheet "Pindahkan ke subholding": pilih induk tujuan (optgroup Subholding / Langsung di bawah holding), catatan dampak, galat server tampil di sheet; sukses → toast + `reload()` struktur. |
| `src/components/companies/subholding.ts` | `canMoveCompany`, `moveTargets` (subholding aktif urut nama, lalu holding; induk sekarang & nonaktif tidak ditawarkan), `moveSuccessText`. |
| `src/components/companies/subholding-panel.tsx` | Segmen Subholding: "PT langsung di bawah PT BIKE Tbk" kini baris dengan tombol "Pindahkan ke subholding" (prop opsional `onMovePt`). |
| `src/components/companies/company-sheet.tsx` | Tab Pengaturan PT (Super Admin): bagian "Induk perusahaan" + tombol "Pindahkan ke subholding" (prop opsional `onMove`) — juga untuk memindah PT antar-subholding. |
| `src/components/views/companies-view.tsx` | State `moveId`, `MoveCompanySheet` dipasang (hanya `canManage`), disambungkan ke panel dan CompanySheet. |
| `tests/api/sh-pindah-pt.test.ts` (baru) | 16 tes API (DB palsu dengan rollback transaksi). |
| `tests/ui/sh-pindah-pt-logic.test.ts` (baru) | 4 tes logika UI. |

## Aturan `moveEntity`

1. Kunci `SELECT "id" FROM "Entity" WHERE "parentId" IS NULL ORDER BY "id" FOR UPDATE` — semua
   pemindahan berurutan, jadi dua pindah bersamaan tidak bisa menimpa path atau membentuk siklus.
   Semua bacaan setelahnya melihat hasil commit terbaru (READ COMMITTED).
2. Entitas tidak ada → 404; bukan PT/SECTOR/REGION (holding/subholding) → 422. Lewat route,
   SECTOR/REGION hanya ditemukan bila `parentId` dikirim; UNIT tetap 404.
3. Induk tujuan: tidak ada / tipe salah (PT, UNIT) / nonaktif → 422. `parentId` kosong/bukan string → 422.
4. Siklus (induk = diri sendiri atau keturunannya) → 422, dicek lewat path DAN rantai `parentId`
   (≤32 tingkat), sehingga path lama yang tidak konsisten tetap tertangkap.
5. Induk sama dengan sekarang → `moved: false`, tanpa tulis, tanpa AuditLog.
6. Path baru = `path induk + segmen terakhir path lama + '/'` (segmen = kode, cocok dengan
   `entityDirectors` di `src/lib/kadiv.ts` yang membaca kode dari path). Path tujuan sudah dipakai → 409.
7. Entitas: `parentId` + `path` baru; keturunan (`path startsWith pathLama`, kecuali diri) →
   ganti awalan. `parentId` keturunan tidak berubah. Pencocokan memakai awalan berakhiran `/`,
   jadi `PT-LAMA2` tidak ikut saat `PT-LAMA` dipindah.
8. AuditLog `MOVE_COMPANY`: before `{ parentId, parentName, parentType, path }`, after
   `{ parentId, parentName, parentType, path, descendants, subholdingReportsKept }`. Bila sekaligus
   mengubah identitas, `UPDATE_COMPANY` juga ditulis di transaksi yang sama.
9. Hanya `companies:manage` (Super Admin); peran lain 403 sebelum transaksi.

## Dampak pada data cakupan

- `scopeEntityIds`, `scopePathPrefix` (`src/lib/auth.ts`), `resolveEntityScope`
  (`admin-compliance-server.ts`), `/api/dashboard`, `/api/compliance-map`, `/api/entities`,
  `src/lib/subholding/scope.ts` (`ptsOfSubholding`, `ptInSubholding`) semuanya membaca `path`
  LANGSUNG dari DB per permintaan — tidak ada salinan path/cache di tabel lain (dicek
  `prisma/schema.prisma`: `path` hanya di `Entity`). Setelah commit, cakupan langsung mengikuti
  struktur baru: Admin subholding tujuan melihat PT di `GET /api/sh/options`; subholding lama tidak.
- Akun yang `scopeEntityId`-nya PT itu tetap sah (id tidak berubah). Direktur yang bercakupan
  subholding/holding lama kehilangan visibilitas PT ini, Direktur subholding tujuan mendapatkannya.
- **SubholdingReport**: `ptId` tetap sah. `subholdingId` TIDAK diubah — laporan lama tetap milik
  subholding yang membuatnya (riwayat, dashboard Ketua Umum per subholding, kotak masuk).
  Konsekuensi (zona SV1, tidak diubah): laporan TERBUKA (MENUNGGU/PERLU_PERBAIKAN) milik subholding
  lama untuk PT yang sudah pindah tidak bisa lagi di-PATCH oleh admin lama dengan PT yang sama
  (`ptInSubholding` → 422 "PT pelaksana harus PT aktif di subholding Anda") kecuali PT-nya
  diganti; Supervisor tetap bisa menyetujui/minta perbaikan. Karena itu jawaban PATCH memuat
  `subholdingReports.open` dan UI menyebutnya di toast. Saran: pindahkan PT saat tidak ada laporan
  terbuka, atau putuskan laporan terbuka dulu.
- Pengingat (`reminders.ts`) menghitung PT per subholding dari path — PT pindah langsung masuk
  pengingat subholding tujuan.

## Gerbang

- `tsc --noEmit --incremental false`: bersih.
- `eslint src`: bersih (0 galat, 0 peringatan).
- `vitest run`: 1.915 lulus / 2 gagal — `tests/api/login.test.ts` & `tests/security/t13-login-plafon.test.ts`
  (timeout 5 dtk saat paralel; keduanya lulus bila dijalankan sendiri, 22/22). 20 tes baru lulus.

## Sisa / catatan

- `GET /api/companies` hanya mengembalikan HOLDING/SUB_HOLDING/PT, jadi UI hanya menawarkan
  subholding/holding sebagai tujuan; pindah ke SECTOR/REGION hanya lewat API.
- Belum diuji di peramban (server tidak dijalankan sesuai instruksi).
- Langkah produksi: Super Admin membuat subholding, lalu "Pindahkan ke subholding" per PT dari
  segmen Subholding. Tidak ada migrasi.
