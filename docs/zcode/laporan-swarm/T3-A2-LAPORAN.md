# Laporan T3-A2 — Ringkasan Manajemen: hapus kartu lama, tambah "Laporan per perusahaan"

Dikerjakan Zcode (agen T3-A2), 8 Oktober 2026. Zona: `src/components/oversight/management-dashboard.tsx` saja (plus laporan ini). Cabang `codex/kerja`, tanpa commit/add/push, tanpa DB/port/kontainer, tanpa `next build`, tanpa dependensi baru.

## Keputusan yang diterapkan

Keputusan pemilik 8 Okt 2026 untuk layar Ringkasan Manajemen (`ManagementDashboard`, dipakai grup MANAJEMEN, DIREKTUR_SDM_GA, TI, SUPERADMIN, AUDITOR).

### Yang dihapus

| Kartu/elemen | Isi yang hilang |
|---|---|
| Kartu "Output selesai" / "Laporan harian masuk" | `BarChart` + angka besar baris terpilih |
| StatTile output | Ubin gradient "Output selesai `periode`" / "Laporan masuk minggu ini" (sparkline, delta) |
| Kartu "Kapan proyek prioritas selesai?" | `Timeline` (baris `!phone`) |
| Kartu "Status N proyek" | `DonutChart` (baris `!phone`) |
| Kartu "Perlu perhatian" | 3 `AttentionItem` teratas + tombol "Lihat N lainnya" |
| Kartu "Persetujuan menunggu" / "Keputusan terbuka" | `ApprovalRequestItems`, `ApprovalItem` pengajuan proyek, `DeadlineProposalItems`, `AttentionItem` eskalasi, tombol "Buka eskalasi" |
| StatTile persetujuan | Ubin "Persetujuan menunggu"/"Eskalasi terbuka" (termasuk jangkar `#mk-persetujuan`) |
| Kartu "Aktivitas terbaru" | 5 `ActivityItem` |

### Kode mati ikut dibersihkan (konsekuensi hapus kartu)

- Impor mk yang tak terpakai: `ActivityItem`, `ApprovalItem`, `AttentionItem`, `BarChart`, `DonutChart`, `SegmentedControl`, `Timeline`. Impor lain: `toast` (sonner), `toastWithUndo`, `ESCALATION_NEEDED_LABELS`, `can`/`canSeeTab` (rbac), `formatRelative`, `timelineFrame` (dash-common), `DeadlineProposalItems`/`RejectDeadlineSheet`/`useDeadlineDecisions`, `ApprovalRequestItems`/`RejectApprovalSheet`/`useApprovalDecisions`.
- `SegmentedControl` periode Minggu/Bulan/Kuartal (di header dan ponsel) dihapus karena satu-satunya efeknya (BarChart, KPI output, subjudul kartu) sudah tidak ada — mengendalikan apa pun akan menjadi kontrol mati. Konstanta `PERIODS`, `Period`, `DONUT_ORDER`, `HOUR`, state `period`/`selectedBar`/`deciding`/`decided`, dan variabel turunan `per`, `series`, `barIndex`, `cur`, `prev`, `deltaPct`, `withDue`, `tl`, `timelineRows`, `pendingDecisions`, `pendingProposals`, `pendingRequests`, `stale`, `overdueEsc`, `waiting`, `now`, `decides`, `seesEscalations` ikut dihapus.
- Fungsi `approveProject` (fetch `/api/projects/approve` + Urungkan) dihapus: pemicunya (`ApprovalItem`) tinggal di tab Persetujuan, bukan layar ini. Sheet `RejectDeadlineSheet`/`RejectApprovalSheet` juga dihapus — hanya bisa dibuka dari dalam kartu yang dihapus, jadi mustahil terbuka lagi. `WeeklyReportSheet` dan `useSearchSelection` TETAP (pemicu pencarian ⌘K masih ada).
- `approvals` kini dihitung mentah (`data.decisions + deadlineProposals + approvalRequests`) tanpa peta keputusan lokal; tetap dipakai kalimat pendukung hero ("N persetujuan menunggu Anda.").
- Prop `reload` tidak lagi dipakai isi komponen, tetap ada di tipe props supaya pemanggil (`oversight-dashboard.tsx`, zona lain) tidak berubah — tidak didestrukturisasi agar tidak jadi variabel menganggur.
- Baris terakhir kini hanya `AttendanceCard` bila `data.attendance` ada (kartu Kehadiran tetap, sesuai perintah).

### Yang dipertahankan

Hero (kalimat jawaban + `ActivityRings` Output/Laporan harian/Tepat waktu), StatTile "Rata-rata progres" dan "Kehadiran"/"Tepat waktu 30 hari" (2 KPI, ≤ 4), kartu "Proyek prioritas" (Chip + `ProjectRow` + `ProjectSheet`), "Kinerja divisi"/"Tepat waktu per perusahaan" (`DivisionBar`), `GroupRolePanel` [F2-GRUP], `EntityActivityBoard`, `WeeklyReportSheet`, `SuperadminStrip`, pencarian ⌘K.

### Yang ditambah

Bagian utama tepat setelah baris KPI (setelah `</Hero>`), sebelum "Proyek prioritas":

```tsx
<section className="flex flex-col gap-3" aria-labelledby="mk-laporan-perusahaan">
  <div className="flex flex-col gap-1">
    <h2 id="mk-laporan-perusahaan" className="t-title-3 text-ink">Laporan per perusahaan</h2>
    <p className="t-footnote text-ink-2">Ketuk perusahaan untuk melihat laporan harian tiap proyek</p>
  </div>
  <CompanyReports projects={data.projects} />
</section>
```

Kontrak antarmuka dipasang persis: `import { CompanyReports } from '@/components/oversight/company-reports'` dengan props `projects: data.projects` (data mentah, tanpa normalisasi PIC). Heading + subjudul saya letakkan di berkas ini (kontrak A3 hanya menerima `projects`); A3 tidak menaruh heading sendiri, tetapi merender baris pengantar "N perusahaan · ketuk untuk membaca laporan hariannya" — parent bisa memutuskan membuang salah satu bila terasa dobel (dua-duanya menyebut "ketuk"). Heading memakai pola yang sudah ada di berkas sekitar (`t-title-3` seperti `divisions-view`/`approvals-view`; subjudul `t-footnote text-ink-2`); jarak antarbagian mengikuti gap `.mk-app__inner`.

**Catatan integrasi A3 (muncul saat tugas berjalan):** berkas `company-reports.tsx` baru digabung A3 ke worktree saat saya menguji, dengan prop bertipe `projects: OversightProject[]` (`pic: string`), padahal `ManagementData.projects` memperbolehkan `pic: string | null` (uji "PIC null"). A3 sudah menangani pic kosong saat runtime (`picName` → "PIC belum ditentukan", inisial `'—'`). Karena zona saya terbatas berkas ini, saya jembatai dengan cast terdokumentasi di lokasi pemanggilan:

```tsx
<CompanyReports projects={data.projects as OversightProject[]} />
```

Ini mempertahankan ekspresi kontrak (`data.projects`) dan tampilan null-PIC milik A3 ('—', konsisten dengan tabel "Proyek prioritas"). Parent/A3 dapat menghapus cast dengan melebarkan tipe prop A3 menjadi `(OversightProject & { pic?: string | null })[]` atau serupa.

## Hasil uji

| Uji | Perintah | Hasil |
|---|---|---|
| TypeScript | `DATABASE_URL/DIRECT_URL=postgresql://x:y@127.0.0.1:1/db npx tsc --noEmit --incremental false` | **Berkas saya bersih — nol galat dari `management-dashboard.tsx`.** Run pertama (sebelum berkas A3 ada): satu-satunya galat zona saya adalah `TS2307 Cannot find module '@/components/oversight/company-reports'` (diharapkan). Run terakhir: exit 2 dengan 1 galat tersisa di `src/components/preview/mock-admin.ts(424,17) TS2304 GROUP_ROLES` — perubahan belum-komit agen lain yang sedang berjalan (sebelumnya juga ada 3 galat blok `[T3-A1]` di `route.ts` yang agen itu perbaiki sendiri selama tugas ini); bukan zona saya, tidak saya sentuh. |
| ESLint | `npx eslint src/components/oversight/management-dashboard.tsx` | Lulus, exit 0, tanpa peringatan (diperiksa ulang setelah cast dan setelah berkas A3 hadir). |
| vitest | Tidak dijalankan (gerbang parent). | — |

Grep sisa identifier terhapus hanya menyisakan `data.deadlineProposals` yang memang dipakai menghitung `approvals`.

## Asersi tes yang terdampak (zona tes milik parent — TIDAK saya ubah)

Hanya `tests/cx/cx15-features.test.ts` yang mengimpor `ManagementDashboard`:

1. **Baris 69–74** (`Auditor: subtitle Keputusan terbuka hanya eskalasi; Manajemen tetap lengkap`): mencari kartu berjudul `'Keputusan terbuka'` lalu membaca `.subtitle` — kartu sudah dihapus, `find` mengembalikan `undefined` → TypeError. Perlu dihapus/ditulis ulang oleh parent.
2. **Baris 90–97** (`delta progres riwayat nyata muncul…`): aman — StatTile "Rata-rata progres" dipertahankan.
3. **Baris 192–196** (`PIC null tidak menjatuhkan Ringkasan Manajemen`): aman — `ProjectRow` dan fallback PIC dipertahankan.
4. **Impor modul**: selama berkas A3 belum tergabung, SELURUH berkas cx15 gagal dimuat (resolusi `company-reports`); kini berkas A3 sudah ada di worktree. Parent tetap disarankan menambah `vi.mock('@/components/oversight/company-reports', …)` di cx15 (layaknya mock `deadline-decisions`/`approval-requests`): `CompanyReports` nyata memakai `useFetch` dan `STATUS` dari `@/components/mk`, dan mock mk di cx15 tidak mengekspor `STATUS` (aman selama `ProjectReportsSheet` tidak dibuka oleh tes, tapi rapuh).

`tests/cx/cx11-preview.test.ts` murni uji API mock (`/api/...`) dan tidak memegang konten kartu mana pun yang dihapus — tidak terdampak. Berkas tes lain (`tests/ui/…`, `tests/qa/…`, `tests/cx/mk-accessibility` dll.) menguji komponen mk atau view lain, bukan layar ini.

## Keterbatasan & catatan untuk parent

- `CompanyReports` A3 hadir di worktree selama tugas berjalan sehingga import terurai nyata; lihat "Catatan integrasi A3" di atas soal jembatan tipe `pic: string | null`.
- Grid kartu perusahaan responsif (desktop 2–3 kolom, tablet 2, ponsel 1), StatusBadge ringkas, dan Sheet drill-down sepenuhnya implementasi A3 di dalam `company-reports.tsx`; kontrak `projects` mengirim data mentah `data.projects` (penanda `reportedToday` ada di tiap proyek).
- Catatan kosmetik di luar zona saya: `.mk-hero__kpis` (globals.css) tetap grid 4 kolom; dengan 2 StatTile tersisa, desktop menampilkan dua kolom kosong di kanan (ponsel otomatis 2 kolom, rapi). Bila ingin rapat, penyesuaian CSS/grid adalah keputusan pemilik zona globals.css.
- Prop `reload` kini tak dipakai di komponen; bila parent ingin membersihkan rantai pemanggil (`oversight-dashboard.tsx`), itu di luar zona saya.
- Galat `tsc` tersisa di worktree (saat run terakhir: `mock-admin.ts` `GROUP_ROLES`; lebih awal: 3 galat blok `[T3-A1]` `route.ts` yang lalu diperbaiki agen itu sendiri) adalah pekerjaan in-flight agen lain — gerbang tsc proyek bersih menunggu zona masing-masing.
- Tanpa git commit/add/push; tanpa menyentuh types/route/mock/sheet/dokumen lain; DB/Supabase/port/kontainer/`next build`/dependensi baru tidak disentuh.
