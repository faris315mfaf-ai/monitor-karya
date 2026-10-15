# SH-UB — UI Persetujuan Supervisor, Dashboard Ketua Umum & Manajemen, meja Superadmin (16 Okt 2026)

Sumber kebenaran: `docs/zcode/KONTRAK-SUBHOLDING-16-OKT.md`; mockup papan 5, 6 (terbaru), 8–9, 10. Tanpa git, tanpa server/DB.

## Berkas

| Berkas | Isi |
|---|---|
| `src/components/views/sh-review/logic.ts` (baru) | Tipe `ShReport`/`ReviewData`, `STATUS_META` (Menunggu=risk, Perlu perbaikan=late, Disetujui=done), `decisionGate` (perbaikan ≥5 huruf, setujui ≥1 bukti, hanya MENUNGGU, kunci saat sibuk), `nextAfterDecision`, `resolveSelected`, `friendlyError` (409/404/422/403/putus), `shouldReload`, `totalWaiting`. |
| `src/components/views/sh-review/sh-review-view.tsx` (baru) | Chip subholding + jumlah menunggu, tab Menunggu / Diminta perbaikan / Disetujui (+jumlah), daftar kiri + rincian kanan; ponsel & tablet bertumpuk dengan tombol "Antrean · n" dan "x dari n". Rincian: PT, pelapor, jabatan, deskripsi, galeri bukti (lightbox), percakapan, komentar + Kirim komentar saja / Minta perbaikan / Setujui. Setelah keputusan pindah ke laporan berikutnya; 409/404 → pesan ramah + muat ulang. |
| `src/components/views/sh-overview/logic.ts` (baru) | `wibDateKey` (Hari ini/Kemarin WIB), `groupByPt`, `normalizePts`, `summaryLabel` ("n laporan · m PT" / "Belum ada laporan"), `defaultOpen`, `initialOf`, `isImageMime`, `stepIndex`, `positionLabel`, `keyDelta`. |
| `src/components/views/sh-overview/evidence.tsx` (baru) | `useSignedUrl` (GET /api/evidence/:id, cache memori 270 dtk + dedup), `EvidenceThumb` (gambar nyata; non-gambar → ikon dokumen), `EvidenceLightbox` (Radix Dialog: fokus terkunci & kembali ke pemicu, Esc, Sebelumnya/Berikutnya + panah kiri/kanan hanya di dalam dialog, dokumen/tautan → tombol "Buka berkas/tautan"). Dipakai juga oleh sh-review. |
| `src/components/views/sh-overview/sh-overview-view.tsx` (baru) | Persis papan 6 terbaru: Hari ini/Kemarin, kartu per subholding (semua, termasuk 0), klik kartu → laporan per PT di bawahnya; baris = judul (tombol → Sheet judul + deskripsi) + thumbnail (≤4, "+n") → lightbox. Tanpa KPI. |
| `src/components/app-shell.tsx` | Peta tab `sh-review` → ShReviewView, `sh-overview` → ShOverviewView (baris UA tidak disentuh). |
| `src/components/shell.tsx` | `TAB_ICONS` untuk 5 tab `sh-*` (ringkasan/kirim/kalender/persetujuan/ringkasan). Dock/sidebar/tab bar memakai mekanisme NAV_TABS yang ada. |
| `src/components/companies/subholding.ts` (baru) | Pohon holding → subholding → PT, `entityKindLabel`, `positionsForPlacement` (subholding = Admin subholding + Direktur; grup/holding = + Supervisor/Ketua Umum/Manajemen berlabel Indonesia; cermin `roleScopeProblem`), `placementProblem`, `credentialText`, `previewAdminUsername`. |
| `src/components/companies/subholding-sheet.tsx` (baru) | `SubholdingSheet`: POST `{name, type:'SUB_HOLDING', parentId, code?}` lalu tampilkan SEKALI `adminAccount.username/defaultPassword` + "Wajib ganti sandi saat masuk pertama", tombol Salin per baris & Salin semua; hanya di state komponen, hilang saat ditutup. `SubholdingPtSheet`: tambah PT di bawah subholding (`positions: []`). |
| `src/components/companies/subholding-panel.tsx` (baru) | Tampilan "Subholding" (papan 10): struktur PT BIKE Tbk → subholding → PT (chip PT, Tambah PT, akun admin), daftar akun Admin subholding / Supervisor / Ketua Umum / Manajemen + Tambah akun. |
| `src/components/views/companies-view.tsx` | Segmen baru "Subholding" (bawaan Super Admin), tombol "Tambah subholding", label jenis entitas, pohon Struktur bersarang subholding → PT, eyebrow hitung subholding. Wizard menerima induk holding + subholding. |
| `src/components/companies/account-sheet.tsx` | Posisi mengikuti penempatan (`positionsForPlacement`), galat `placementProblem`, label "· subholding" di pilihan perusahaan. |
| `src/components/companies/company-sheet.tsx` | Label Subholding, kelengkapan subholding diperlakukan seperti holding. |
| `src/components/companies/company-wizard.tsx` | Permintaan SV2: draf `ADMIN_PT` bawaan dihapus (PT tanpa akun sendiri); induk = subholding/holding (subholding diutamakan). |
| `tests/ui/sh-overview-logic.test.ts`, `tests/ui/sh-review-logic.test.ts`, `tests/ui/subholding-companies.test.ts` (baru) | 38 tes: pengelompokan per PT, ringkasan kartu, tanggal WIB, navigasi lightbox, gerbang tombol keputusan, laporan berikutnya, 409, pohon & posisi subholding, kredensial. |

## Gerbang

- `tsc --noEmit`: bersih (galat sementara di `src/app/api/sh/**` milik SV1 sudah hilang saat terakhir dijalankan).
- `eslint src`: 0 galat; 1 peringatan di `src/lib/subholding/rules.ts:101` (SV1).
- `vitest run`: 1.856 lulus / 8 gagal — semuanya di luar zona UI: `tests/api/keamanan-galat-mentah.test.ts` & `auditor-readonly.test.ts` (rute `/api/sh/*`, SV1), `tests/api/login.test.ts` & `tests/security/t13-login-plafon.test.ts` (timeout 5 dtk saat paralel). 38 tes UI baru lulus.

## Catatan / sisa

- PATCH `/api/companies` tidak mendukung memindah induk PT; "kelola PT di bawah subholding" = tambah PT baru di subholding + buka detail PT. PT lama di bawah holding tampil sebagai "PT langsung di bawah PT BIKE Tbk".
- `src/components/pic/nav-badges.ts` masih memanggil `/api/nav-badges` untuk MANAJEMEN, dan tombol cari (⌘K) di shell memanggil `/api/search` untuk semua peran — bagi peran subholding-only itu 403 senyap (bukan zona UB).
- Kelengkapan profil PT di bawah subholding masih menghitung "Admin PT/Direktur/divisi" (fungsi `completeness` tidak tahu jenis induk).
- Belum diuji di peramban (server tidak dijalankan sesuai instruksi).
