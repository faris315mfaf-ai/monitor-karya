# Laporan T3-A3 — Drill-down laporan per perusahaan (CompanyReports)

Dikerjakan Zcode (agen T3-A3), 8 Oktober 2026. Zona: `src/components/oversight/company-reports.tsx` (baru), `tests/ui/company-reports.test.ts` (baru), dan laporan ini. Cabang `codex/kerja`, tanpa commit. Tidak menyentuh `management-dashboard.tsx`, route, `types.ts`, maupun mock.

## Hasil

`CompanyReports({ projects })` memenuhi keputusan pemilik 8 Okt 2026:

1. **Kartu perusahaan** — grid responsif `grid-cols-1 min-[600px]:grid-cols-2 lg:grid-cols-3` (Tailwind v4 CSS-first; 600/1024 mengikuti batas tablet/desktop desain). Kelompok dari `projects` per `{entityId, entityName, entityCode}` (`groupCompanies`, urutan kemunculan pertama). Tiap kartu = `<button type="button">` dengan `mk-card mk-card--inset` berisi nama PT, "n proyek", "x dari y proyek lapor hari ini", dan StatusBadge (`companyBadge`: semua lapor → done "Semua lapor"; sebagian → risk "n belum lapor" / "Belum ada yang lapor"; tanpa proyek → neutral "Belum ada yang wajib"). `aria-label="Lihat laporan perusahaan <nama>"`. Kalimat jawaban di atas grid: "n perusahaan · ketuk untuk membaca laporan hariannya".
2. **Sheet perusahaan** (Sheet mk, backLabel "Laporan per perusahaan") — judul nama PT, eyebrow kode PT, subjudul "x dari y proyek lapor hari ini"; daftar proyek `ProjectRow` di dalam `mk-prows`. Kolom `due` ProjectRow dipakai untuk "Lapor hari ini"/"Belum lapor" (fokus layar ini kepatuhan laporan; status proyek tetap di StatusBadge), baris terpilih disorot lewat `selected`.
3. **Sheet proyek** (backLabel "Perusahaan") — identitas (nama, kode, PIC, StatusBadge status), `StatTile` "Lapor 14 hari" (dihitung dari item yang dimuat; delta jumlah laporan terlambat), daftar laporan harian terbaru dimuat malas `useFetch('/api/daily-reports?projectId=<id>&pageSize=14')` hanya saat sheet terbuka, tiap baris: tanggal `formatDate` + jam `formatTime` (WIB), StatusBadge `reportBadge` (SELESAI→done Selesai, ON_PROGRESS→on Dikerjakan, TERKENDALA→risk Terkendala, MENUNGGU_KEPUTUSAN→risk Menunggu keputusan, TIDAK_ADA_PERUBAHAN→neutral Tanpa perubahan; tak dikenal → neutral), capaian 1 baris (`oneLine`, 110 karakter), lencana kedua "Terlambat" (late) bila `isLate`. Bagian "Perlu perhatian & eskalasi" dari `project.escalations ?? []`: summary, "Dibutuhkan: <label>", umur "x hari" (`ageDays` fallback dari `raisedAt`), StatusBadge `escalationBadge` (DIAJUKAN→risk, DITINJAU→info, DIPUTUSKAN→done, DITUTUP→done) + "Lewat SLA" (late) bila overdue. Kosong: EmptyNote "Belum ada eskalasi pada proyek ini."
4. Loading Skeleton per bagian, galat ErrorNote + "Coba lagi" (`reload`), kedua Sheet dipasang bersama sejak render pertama dan memakai pola last/open (DivisionSheet) sehingga isi bertahan selama animasi menutup; URL useFetch menjadi null saat tertutup sehingga data terakhir tetap tampil. Tanpa tombol aksi tulis (baca-saja untuk grup).

## Hasil uji

| Uji | Perintah | Hasil |
|---|---|---|
| Vitest | `npx vitest run tests/ui/company-reports.test.ts` | Hijau — 20 tes lulus (5 suite) |
| TypeScript | `DATABASE_URL/DIRECT_URL=postgresql://x:y@127.0.0.1:1/db npx tsc --noEmit --incremental false` | **Exit 0, nol galat (jalankan akhir).** Galat pernah tampak selama saya bekerja dan bergerak antar-jalankan karena agen lain aktif di worktree bersama: 3 galat `ringkasan/route.ts` (T3-A1, jalankan pertama) dan `management-dashboard.tsx(191)` (muncul saat T3-A2 mengaitkan komponen saya; beres lewat pelebaran tipe di bawah), lalu `mock-admin.ts` GROUP_ROLES — semuanya hilang di jalankan akhir setelah pemilik zonanya menyelesaikannya. |
| ESLint | `npx eslint src/components/oversight/company-reports.tsx tests/ui/company-reports.test.ts` | Lulus, exit 0 |

Tes mengikuti pola `tests/ui` yang ada (pohon elemen tanpa DOM, React useState/useMemo dimock, `@/hooks/use-fetch` dimock seperti audit-view-phone.test.ts): fungsi murni `groupCompanies`, `companyBadge`, `reportBadge`, `escalationBadge`, `oneLine`, plus pohon kartu (kalimat jawaban, kelas grid, tombol aksesabel + isi + lencana, kedua Sheet terpasang, keadaan kosong EmptyNote). Render isi Sheet tidak diuji (sesuai batasan).

## Keputusan desain

- **Kontrak props dilebarkan, bukan diubah**: T3-A2 memasang `<CompanyReports projects={data.projects} />` dengan data mentah (`pic: string | null`). Tipe prop jadi `CompanyProject[]` = `Omit<OversightProject, 'pic'> & { pic: string | null; escalations?: … }`, sehingga `OversightProject[]` (pic: string) tetap diterima dan pemasangan T3-A2 lolos tsc tanpa menyentuh berkasnya. `pic` null dipetakan ke "PIC belum ditentukan" (inisial "—").
- **Kolom `due` ProjectRow** memuat "Lapor hari ini"/"Belum lapor" — spesifikasi daftar proyek menyebut status, progres, PIC, dan lapor/belum (tenggat tidak diminta); ini menjaga StatusBadge tetap murni status proyek (warna+ikon+kata).
- **Grid memakai `min-[600px]:`** agar batas tablet desain (600) terpenuhi tepat; `lg:` = 1024 pas dengan sidebar desktop. Kelas Tailwind biasa, tanpa hex/px acak.
- **Peta status mengikuti spesifikasi tugas**, bukan `status-badges.tsx` lama: MENUNGGU_KEPUTUSAN → risk (bukan info) dan ON_PROGRESS → "Dikerjakan" (bukan "Berjalan") pada laporan harian; eskalasi DIAJUKAN → risk, DITUTUP → done. Status tak dikenal jatuh ke neutral dengan teks asli (pola `Unknown`).
- **Kalimat jawaban tetap di dalam komponen** (wajib dari keputusan pemilik). T3-A2 juga memasang subjudul "Ketuk perusahaan untuk melihat laporan harian tiap proyek" di parent — maknanya bertumpang tindih dengan kalimat saya; sesuai catatan T3-A2, parent yang membuang salah satu bila dianggap dobel (zona mereka).
- StatTile "Lapor 14 hari": nilai = jumlah item terbaru yang dimuat (≤ 14), tone late bila ada `isLate`, selain itu on/neutral.

## Keterbatasan

- Filter `projectId` pada `/api/daily-reports` sudah tersedia di worktree (perubahan belum-komit T3-A1, dengan validasi panjang parameter) — komponen mengirim `projectId` sejak awal sesuai kontrak; saat awal saya membaca rute, filter itu belum ada, jadi ketergantungan ini selesai di sisi pemilik rute tanpa perubahan di zona saya.
- `escalations` per proyek kini diisi `/api/ringkasan` (perubahan belum-komit T3-A1, `projects[].escalations` di `types.ts` + route); bentuknya cocok dengan `CompanyEscalation`. Kode tetap tahan bila field absen (respons lama → EmptyNote).
- Interaksi Sheet (animasi tutup, fokus, gestur ponsel) tidak diuji otomatis — mengikuti komponen mk yang sudah teruji; pola last/open disalin dari DivisionSheet.
- tsc akhir hijau berkat zona agen lain yang juga sudah beres; gerbang worktree bersama perlu diulang bila ada agen yang masih menyentuh berkasnya.
- Tanpa commit, tanpa `next build`, tanpa DB nyata, tanpa dependensi baru.
