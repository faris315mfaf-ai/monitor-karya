# CX 12 — Cleanup komponen dan dependensi

Primitif formulir dimigrasi ke MK dengan refs dan semantik native yang
terpelihara. ConfirmDialog mempertahankan aksesibilitas Radix dengan Button MK.
Import UI lama dimigrasi; sembilan berkas `src/components/ui/*` dan hook
`src/hooks/use-toast.ts` dihapus. Layout memakai MK sonner.

Parent menerapkan token pada `src/lib/accounts.ts`/`constants.ts` dan menghapus
alias palet lama `src/app/globals.css`. Berkas baru:
`src/components/mk/{forms,confirm-dialog,sonner}.tsx`; perubahan menyentuh
layout, formulir login/ganti sandi, akun/perusahaan/akses dan pemakai formulir.
Inventaris Newton **46 path** ditaruh di lampiran; patch parent menambah tiga
path token di luar inventaris tersebut.

**Cleanup aktual 47 dependencies: 67 → 20** pada package.json/package-lock.json.
Baseline devDependencies adalah 12. Penghapusan 41 paket pada CD 8 tidak terbukti;
cleanup 47 ini adalah perubahan putaran sekarang. Radix yang masih diperlukan
serta penggunaan implisit Prisma/sharp dipertahankan menurut laporan worker.

Newton: 36 tes/5 berkas, TypeScript/lint/diff lolos; regresi bersama CX 10.
Docker fase 2 setelah cleanup lolos. Tiga grafik keputusan pemilik dan API-nya
(management-charts, compliance-treemap, kpi-trend-chart) tetap dipertahankan;
tidak ada keputusan hapus/pasang fitur baru pada putaran ini.

Bukti integrasi bersama dan versi runtime: [hasil CX 8–15](CX8–15-HASIL.md).
Riwayat pemeriksaan: [lampiran lanjutan](LANJUTAN-POIN1-7-DAN-CX8-15.md).
