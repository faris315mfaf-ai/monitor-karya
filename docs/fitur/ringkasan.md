# Ringkasan (dashboard per peran)

[← Indeks](README.md) · Spesifikasi: [`docs/design/peran/`](../design/peran/)

## Tujuan

Tab pertama setiap peran. Layar ini menjawab satu pertanyaan dalam satu kalimat ("92% laporan harian sudah masuk hari ini."), lalu menampilkan paling banyak 4 KPI dan kartu yang menuntun ke tindakan berikutnya. Untuk PIC proyek, tab ini bernama **Hari ini**.

## Siapa memakai, apa yang dilihat

| Peran | Komponen | Kalimat pembuka (contoh) | Sumber data |
| --- | --- | --- | --- |
| PIC proyek | `PicDashboard` | "Aplikasi Absensi 64% selesai." | `/api/my-dashboard` (kind `PIC`), `/api/outputs`, `/api/project-notes`, `/api/project-stages`, `/api/deadline-proposals` |
| Kepala divisi | `KadivDashboard` | "Divisi Teknologi menyelesaikan 31 output minggu ini." | `/api/my-dashboard` (kind `KADIV`), `/api/kadiv/team`, `/api/outputs/review` |
| Admin PT | `AdminDashboard` | "92% laporan harian sudah masuk hari ini." | `/api/my-dashboard` (kind `ADMIN`), `/api/admin/overview`, `/api/access-requests`, `/api/admin/reminder-rules` |
| Direktur entitas | `DirectorDashboard` | "5 dari 8 proyek berjalan sesuai rencana." | `/api/ringkasan` |
| Manajemen, Direksi SDM & GA, TI, Super Admin, Auditor | `ManagementDashboard` | "6 dari 9 proyek berjalan sesuai rencana." | `/api/ringkasan` |

`DashboardView` ([`views/dashboard-view.tsx`](../../src/components/views/dashboard-view.tsx)) memanggil `/api/my-dashboard`. Jawabannya berisi `kind` (`PIC`, `KADIV`, `ADMIN`, atau `OVERSIGHT`) yang menentukan layar. `OVERSIGHT` diteruskan ke [`oversight-dashboard.tsx`](../../src/components/views/oversight-dashboard.tsx), yang memilih layar Direktur atau Manajemen. Bila data divisi kosong (misalnya migrasi 0015 belum diterapkan), Direktur jatuh ke tata letak Manajemen.

## PIC proyek: Hari ini

| Desktop | Ponsel |
| --- | --- |
| ![PIC desktop](img/layar/pic-ringkasan-desktop.png) | ![PIC ponsel](img/layar/pic-ringkasan-ponsel.png) |

![Wireframe PIC](img/wf-pic-ringkasan.svg)

Isi layar:

- **Hero.** Persentase proyek, alasan bila perlu perhatian, sisa waktu menuju 17.00 WIB, tombol primer "Isi laporan harian", dan cincin progres.
- **KPI saat ada output:** Output diterima, Menunggu review, Perlu revisi, Menuju tenggat (dengan "usul …" bila ada usulan tenggat).
- **Kartu Laporan harian** dengan `FlowDiagram`: Isi laporan → Terkirim ke Admin PT → Diteruskan ke holding.
- **Tahapan proyek** bertanggal, dengan "Atur tahapan". Tanpa tahapan, kartu menampilkan 4 fase tetap.
- **Output saya** dan **Catatan kepala divisi.** Detailnya di [output-review.md](output-review.md).
- **Lencana header** "Laporan hari ini · Belum dikirim" dan badge navigasi "Laporan harian 1".

## Kepala divisi

| Desktop | Ponsel |
| --- | --- |
| ![Kadiv desktop](img/layar/kadiv-ringkasan-desktop.png) | ![Kadiv ponsel](img/layar/kadiv-ringkasan-ponsel.png) |

![Wireframe kepala divisi](img/wf-kadiv-ringkasan.svg)

Isi layar:

- **Hero.** Output divisi minggu ini dan tiga cincin: Laporan harian (orang cuti tidak dihitung), Output, Kehadiran.
- **KPI:** Output selesai, Menunggu review, Rata-rata beban kerja, Sisa waktu serah.
- **Kartu:**
  - Output menunggu review: Terima, Minta revisi, Terima semua.
  - Laporan harian tim, dengan Ingatkan dan Atur anggota.
  - Beban kerja tim, dengan garis target 80%.
  - Output per orang 10 hari kerja dan tren 8 minggu.
  - Aktivitas tim.
- Bila data tim gagal dimuat, hero kembali ke versi capaian mingguan.

Rumus beban kerja ada di [`src/lib/kadiv.ts`](../../src/lib/kadiv.ts) → `workloadPct`:

```
menit tugas      = durationMin, atau endAt − startAt, atau 60
sisa menit       = menit × (100 − progres) / 100   (tugas terbuka, termasuk tunggakan ≤ 14 hari)
kapasitas        = (hari kerja tersisa minggu ini − hari cuti) × 480 menit
beban (%)        = sisa menit ÷ kapasitas × 100      (80% batas sehat; > 100% kelebihan)
```

`DivisionBar` membatasi batangnya di 100%, tetapi angka sebenarnya (misalnya 112%) tetap ditulis di bawahnya.

## Admin PT

| Desktop | Ponsel (Ringkasan) |
| --- | --- |
| ![Admin desktop](img/layar/admin-ringkasan-desktop.png) | ![Admin ponsel](img/layar/admin-ringkasan-ponsel.png) |

![Wireframe Admin PT](img/wf-admin-ringkasan.svg)

Isi layar:

- **Hero.** Persentase laporan harian yang masuk hari ini, jumlah yang siap diteruskan, dan permintaan akses yang menunggu. Tiga cincin: Laporan harian, Laporan mingguan, Kepatuhan bulan ini.
- **KPI:** Laporan masuk (dengan sparkline 10 hari), Belum lapor, Siap diteruskan, Eskalasi terbuka.
- **Kepatuhan laporan per orang** per divisi ("46 dari 50 orang"). Ketuk divisi untuk membuka Sheet. Aturan hitungnya:
  - Yang wajib lapor adalah anggota aktif yang menjadi PIC proyek aktif.
  - Seseorang dihitung sudah lapor bila semua proyeknya terkirim hari ini.
  - Orang yang CUTI, SAKIT, atau IZIN keluar dari penyebut.
- **Kartu tambahan:**
  - Riwayat 10 hari kerja.
  - Permintaan akses dan Pengingat otomatis (lihat [permintaan-akses.md](permintaan-akses.md) dan [pengingat.md](pengingat.md)).
  - Data induk dan Pengguna per peran.

Angka "laporan masuk" di Ringkasan dan di Meja kerja dihitung oleh fungsi yang sama, `countDailyIntake` ([`src/lib/daily-intake.ts`](../../src/lib/daily-intake.ts)): proyek AKTIF dengan laporan hari ini yang sudah terkirim.

## Direktur entitas

| Desktop | Ponsel |
| --- | --- |
| ![Direktur desktop](img/layar/direktur-ringkasan-desktop.png) | ![Direktur ponsel](img/layar/direktur-ringkasan-ponsel.png) |

![Wireframe Direktur](img/wf-direktur-ringkasan.svg)

Isi layar:

- **Saringan divisi** berupa `SegmentedControl` (Semua + tiap divisi). Saringan ini berlaku untuk seluruh halaman, dan segmen donat juga bisa dipakai untuk menyaring.
- **Hero.** Proyek sesuai rencana dan tiga cincin: Output, Laporan mingguan, Tepat waktu.
- **KPI:** Output selesai minggu ini, Laporan mingguan Mxx, Eskalasi menunggu, Milestone 14 hari. Ponsel hanya menampilkan 2 KPI.
- **Laporan mingguan divisi:**
  - Lencana per divisi: Terkirim, Terlambat masuk, Belum masuk, Sudah dibaca.
  - Tombol per baris: "Baca laporan" atau "Ingatkan".
  - Alur laporan minggu ini: PIC → Kepala divisi → Direktur.
  - "Tandai sudah dibaca" menulis `WeeklyReportRead` dan bisa diurungkan.
  - Minggu laporan = minggu berjalan bila tenggat serah sudah lewat, selain itu minggu lalu.
- **Kartu lain:** Output yang sedang dikerjakan (donat per divisi), milestone (`Timeline`, atau daftar "Milestone 14 hari" di ponsel), Tren output 8 minggu, Tepat waktu per divisi (target 85).
- **Usulan tenggat.** Muncul sebagai `ApprovalItem` dengan Setujui/Tolak. Tolak wajib alasan. Lihat [output-review.md](output-review.md#usulan-geser-tenggat).

Warna divisi tetap menurut nama ([`src/lib/division-tone.ts`](../../src/lib/division-tone.ts)): Teknologi `data-1`, Keuangan `data-2`, Media `data-3`, SDM `data-4`, Operasional `data-5`, Hukum `data-6`. Nama lain mendapat warna stabil dari nama.

## Manajemen dan peran grup

| Desktop | Ponsel |
| --- | --- |
| ![Manajemen desktop](img/layar/manajemen-ringkasan-desktop.png) | ![Manajemen ponsel](img/layar/manajemen-ringkasan-ponsel.png) |

![Wireframe Manajemen](img/wf-manajemen-ringkasan.svg)

Isi layar:

- **Periode** Minggu, Bulan, atau Kuartal.
- **Cincin:** Output, Laporan harian, Tepat waktu.
- **KPI:** Output selesai, Rata-rata progres, Persetujuan menunggu ("x lewat 24 jam"), Kehadiran.
- **Kartu:**
  - Output selesai: batang 8 periode. Bila belum ada output, kartu memakai laporan harian.
  - Perlu perhatian: terlambat dulu, lalu tenggat terdekat.
  - Kinerja divisi: divisi bernama sama digabung lintas PT.
  - Persetujuan menunggu: termasuk usulan tenggat.
  - Kehadiran hari ini.
- Auditor melihat "Keputusan terbuka". Klik eskalasi membawa auditor ke Log aktivitas, karena auditor tidak punya tab Eskalasi.

## Endpoint

| Metode & path | Parameter | Jawaban | Izin |
| --- | --- | --- | --- |
| `GET /api/my-dashboard` | — | `{ kind: 'PIC' \| 'KADIV' \| 'ADMIN' \| 'OVERSIGHT', … }` | semua peran; isi sesuai peran |
| `GET /api/ringkasan` | — | Status proyek, kepatuhan per PT, tren 8 minggu, keputusan menunggu, aktivitas, `reportWeek`, `divisions[]`, `outputs`, `deadlineProposals`, `attendance`, `viewer` | peran pemantau; cakupan entitas pemanggil |
| `POST /api/ringkasan/laporan-dibaca` | `{ weeklyReportId }` | tanda dibaca (idempoten) | Manajemen, Direktur entitas, SDM & GA, Super Admin; laporan harus sudah diserahkan dan dalam cakupan, selain itu 404 |
| `DELETE /api/ringkasan/laporan-dibaca` | `{ weeklyReportId }` | batal tanda (toast "Urungkan") | sama |
| `GET /api/nav-badges` | — | `{ badges: { 'daily-input': n } }` untuk PIC: laporan hari ini yang belum terkirim; kosong setelah tenggat dan di hari libur | semua |
| `GET /api/dashboard`, `/api/kpi-trends`, `/api/compliance-map`, `/api/management-charts` | `?scopeEntityId=` | Agregat lama (KPI, tren 6 bulan, peta kepatuhan, 6 grafik) | cakupan entitas; peran berlingkup tidak bisa melebar |

Bacaan tabel baru di `/api/ringkasan` (Output, DeadlineProposal, WeeklyReportRead, kolom `divisionId`, Attendance) dijaga. Bila migrasinya belum diterapkan, bagian itu kosong dan sisa ringkasan tetap tampil.

## Berkas kode utama

- [`src/components/views/dashboard-view.tsx`](../../src/components/views/dashboard-view.tsx), [`role-dashboards.tsx`](../../src/components/views/role-dashboards.tsx), [`dash-common.tsx`](../../src/components/views/dash-common.tsx) (`DashHeader`, `ProjectSheet`, timeline)
- [`src/components/views/oversight-dashboard.tsx`](../../src/components/views/oversight-dashboard.tsx), [`src/components/oversight/`](../../src/components/oversight/) (`director-dashboard`, `management-dashboard`, `weekly-reports`, `deadline-decisions`, `types`)
- [`src/components/kadiv/`](../../src/components/kadiv/), [`src/components/admin/`](../../src/components/admin/), [`src/components/pic/`](../../src/components/pic/)
- [`src/app/api/my-dashboard/route.ts`](../../src/app/api/my-dashboard/route.ts), [`src/app/api/ringkasan/route.ts`](../../src/app/api/ringkasan/route.ts), [`src/app/api/ringkasan/laporan-dibaca/route.ts`](../../src/app/api/ringkasan/laporan-dibaca/route.ts)

## Catatan terbuka

- `views/management-charts.tsx`, `dashboard/compliance-treemap.tsx`, dan `dashboard/kpi-trend-chart.tsx` sudah dipindah ke desain baru, tetapi belum dipakai layar mana pun. API-nya masih ada.
- Laporan mingguan M41 untuk Direktur (draf otomatis, "Kirim ke Direktur") belum dibangun.
- "Ingatkan" di layar Direktur memanggil `/api/notifications/remind`. Endpoint itu mengingatkan semua divisi PT yang belum menyerahkan minggu **berjalan**, bukan satu divisi untuk minggu laporan yang tampil.
- `timelineFrame` di `dash-common.tsx` menghitung "hari ini" dari zona waktu peramban, bukan WIB.
