# T8-W3 — Modul Statistik Admin PT (web): tab baru, Penerimaan keluar, mock pratinjau disesuaikan

Keputusan pemilik 9 Okt 2026 diterapkan di pohon kerja `monitor-karya-codex` tanpa commit (sesuai instruksi). Kartu kepatuhan **tidak diubah isinya** — hanya dipindah tempatnya; `admin-summary.tsx` dan `admin-desk.tsx` tidak disentuh (zona agen lain).

## 1. Tab baru `statistik` untuk Admin PT

- `src/lib/constants.ts` — `NAV_TABS` mendapat `{ id: 'statistik', label: 'Statistik', short: 'Statistik' }` tepat setelah `work-desk`, sehingga urutan tab tersaring (sidebar/tab bar mengikuti urutan `NAV_TABS`) sama dengan `ROLE_TABS`. `NavTabId` kini mencakup `'statistik'`.
- `src/lib/rbac.ts` — `ROLE_TABS.ADMIN_PT` menjadi `['dashboard', 'work-desk', 'statistik', 'daily-input', 'projects', 'divisions', 'escalations']`: `'inbox'` dihapus (penerusan laporan diserap Meja Kerja + tombol di Ringkasan), `'statistik'` masuk setelah `'work-desk'`. Komentar mencatat keputusan 9 Okt 2026.
- `src/components/shell.tsx` — `TAB_ICONS` (bertipe `Record<NavTabId, IconName>`) mendapat `statistik: 'naik'` (ikon tren naik; tidak menambah ikon baru ke design-system). Label teks tetap dari `NAV_TABS` lewat `tabLabel()`.
- `src/components/views/statistik-view.tsx` (baru) — memakai `useCompliance()` sekali untuk dua kartu: `ComplianceCard` (kepatuhan harian/mingguan per divisi + Sheet divisi + Ingatkan) dan `ComplianceHeatmapCard` (peta panas 10 hari kerja). Header `PageHeader` berjudul "Statistik" dengan konteks tanggal + minggu ISO, plus satu kalimat jawaban (`x dari y orang PIC sudah lapor hari ini`).
- `src/components/app-shell.tsx` — pemetaan view: `{activeTab === 'statistik' && <StatistikView />}`. Penahan `canSeeTab` di `MainContent` otomatis menolak peran lain yang mencoba membuka tab `statistik` dari tab tersimpan.

Otorisasi tidak melemah: hanya `ADMIN_PT` yang mendapat `statistik`; `inbox` tetap milik `TI` dan `SUPERADMIN`. API `/api/inbox` dan seluruh gate kapabilitas tidak diubah sama sekali — ini murni navigasi.

## 2. Tiruan pratinjau (mock) ringkasan admin lama disesuaikan

`src/components/preview/mock-admin.ts`:

- Rute tiruan `/api/admin/overview` (data induk + pengguna per peran) dan `/api/admin/activity` (log aktivitas) dicabut — keduanya hanya membesi kartu Ringkasan Admin yang dihapus pemilik. Fungsi `overviewFor()` dihapus; impor yang jadi yatang (`unlockItems`, `divisions`, `ROLE_LABELS`, tipe `AdminOverview`) ikut dibersihkan.
- **Kepatuhan tetap ada**: `/api/admin/compliance` dan `/api/admin/compliance/remind` tidak diubah (dipakai modul Statistik), begitu pula `/api/access-requests*` (dipakai Meja Kerja Admin, Sistem & akses, dan formulir PIC/Kepala divisi), `/api/admin/reminder-rules` (juga dipakai matriks pengingat holding), dan `/api/audit-logs/export` (CSV tetap melayani modul Log aktivitas peran holding; larik `activity` + `log()` tetap mencatat REMIND_PIC dsb.).
- `src/components/preview/mock-summary.ts` — tidak perlu diubah: `complianceFor()` (kepatuhan) dan `companiesFor()` (meja akun) masih dipakai; `summaryFor()` melayani `/api/ringkasan` semua peran. Data "Kepatuhan perusahaan" berasal dari `/api/my-dashboard` (`mock-api.ts`, di luar zona T8-W3) dan tetap dipakai hero Ringkasan.
- Rute produksi `/api/admin/overview` dan `/api/admin/activity` **tidak** disentuh (bukan zona ini; tes `tests/cx/cx8-regressions.test.ts` terhadap rute nyata tetap lulus).

## 3. Penyesuaian tes (tanpa melemahkan otorisasi)

- `tests/cx/cx11-preview.test.ts` — asersi `/api/admin/overview` (label peran) dialihkan ke sumber yang tetap hidup: label `missing[].role` dari `/api/admin/compliance` dan label `roles` dari `/api/access-requests/options`; intent "label peran bukan kode mentah" tetap terkunci.
- `tests/cx/t8-statistik.test.ts` (baru) — mengunci keputusan: urutan tab Admin PT persis (`statistik` setelah `work-desk`, tanpa `inbox`), `statistik` hanya untuk Admin PT di seluruh `ROLE_TABS`, `inbox` tetap untuk TI/Super Admin, dan label nav "Statistik" terdaftar.
- Tidak ada tes lain yang mengunci tab/kartu lama (grep `ROLE_TABS|canSeeTab|'inbox'` di `tests/` hanya menemukan API `/api/inbox` yang tidak berubah; `tests/ui/compliance-responsive.test.ts` dan `tests/ui/short3.test.ts` menguji komponen compliance langsung dan tidak tersentuh).

## Efek samping yang diketahui (zona agen lain, bukan T8-W3)

`admin-summary.tsx` dan `admin-desk.tsx` masih memanggil `setActiveTab('inbox')` di beberapa tombol. Setelah tab `inbox` dicabut dari Admin PT, tombol itu akan menabrak penahan "Modul ini tidak tersedia untuk peran Anda" sampai agen pemilik kedua berkas itu mengarahkannya ulang (mis. ke `work-desk`). Dibiarkan sengaja — zona agen lain.

## Uji wajib (semua lulus)

- `npx vitest run tests/cx tests/api` → **56 berkas / 1186 tes lulus**, 0 gagal (termasuk `t8-statistik` dan `cx11-preview` yang disesuaikan).
- `npx vitest run tests/security tests/ui` → **11 berkas / 121 tes lulus** (pemeriksaan tambahan karena `rbac.ts` berubah).
- `npx tsc --noEmit` → nol galat.
- `npx eslint` pada delapan berkas yang diubah/dibuat → lulus tanpa peringatan.

Berkas yang diubah: `src/lib/rbac.ts` (hanya `ROLE_TABS.ADMIN_PT`), `src/lib/constants.ts` (`NAV_TABS`), `src/components/shell.tsx` (satu baris `TAB_ICONS`), `src/components/app-shell.tsx` (impor + satu baris pemetaan), `src/components/preview/mock-admin.ts`, `tests/cx/cx11-preview.test.ts`. Berkas baru: `src/components/views/statistik-view.tsx`, `tests/cx/t8-statistik.test.ts`. Tidak ada commit, tidak menyentuh basis data, tidak menyentuh `admin-summary.tsx`/`admin-desk.tsx`/`compliance.tsx`.
