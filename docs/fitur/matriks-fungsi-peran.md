# Matriks fungsi per peran

[← Indeks](README.md) · Spesifikasi layar: [`docs/design/peran/`](../design/peran/) · Sisa pekerjaan: [`SISA-PEKERJAAN.md`](../SISA-PEKERJAAN.md)

Setiap fungsi yang bisa dipakai tiap peran, beserta layar, endpoint, status, dan fase pengerjaannya. Disusun 6 Oktober 2026 setelah gerbang Fase 3 dan integrasi akhir, dari kode di cabang `desain-baru` dan laporan tiap fase.

> **Belum ada yang dicoba dengan basis data sungguhan.** Migrasi 0013–0025 belum diterapkan (lihat [README](README.md#migrasi-manual-00130025)). "Selesai" di tabel ini berarti kode sudah dibangun, lolos `tsc`, `eslint`, dan `vitest` (dengan basis data tiruan), dan layarnya sudah dicoba di `/pratinjau` dengan data contoh. Fungsi yang bergantung pada tabel baru akan menjawab 503 atau tampil kosong sampai migrasinya diterapkan.

## Cara membaca

| Kolom | Isi |
| --- | --- |
| Fungsi | Hal yang bisa dilakukan atau dilihat peran itu |
| Layar | Tab (`NavTabId`) dan kartu/Sheet tempat fungsi itu ada |
| Endpoint | Route API yang dipakai. Migrasi yang dibutuhkan ditulis dalam kurung bila fungsinya bergantung pada tabel baru. |
| Status | **selesai**, **sebagian**, atau **belum**, dengan alasan bila bukan selesai |
| Fase | Fase terakhir yang membangun atau mengubah fungsi itu (lihat di bawah) |

| Fase | Isi |
| --- | --- |
| 0 | Sudah ada sebelum Fase 1 (putaran P1–P3: desain baru, fitur P2, penguatan keamanan) dan tidak diubah fungsinya sesudahnya |
| 1 | Fondasi: F1-A laporan harian, F1-B laporan mingguan, F1-C keamanan akun, F1-D utang teknis |
| 2 | Fungsi peran: PIC, Kepala divisi, Admin PT, Direktur & Manajemen, peran grup, Urungkan & riwayat |
| 3 | Data contoh `/pratinjau` dan tes route |
| 4 | Daftar periksa desain (F4-A, F4-B) dan integrasi akhir |

Tanda panah (`0 → 2`) berarti fungsi itu sudah ada lalu diubah di fase berikutnya.

## Keputusan yang berlaku untuk semua peran

Keputusan pemilik produk:

- Laporan harian PIC dikirim **langsung ke Admin PT**. Kepala divisi hanya melihat dan menandai sudah dibaca.
- Laporan harian yang sudah diteruskan ke holding **dibekukan**. Ubah, kirim ulang, atau hapus dijawab 409 "Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya." Perubahan hanya lewat buka kunci yang disetujui dan dijalankan.
- Tenggat mingguan: **serah Kamis 17.00 WIB, kunci Jumat 17.00 WIB**.
- Berkas bukti tetap di **Supabase Storage**. Deploy sasaran adalah **VPS** (`deploy/`); cron dijadwalkan lewat [`deploy/app-vps/cron.sh`](../../deploy/app-vps/cron.sh).

Keputusan bawaan orkestrator (belum dikonfirmasi pemilik produk, bisa diubah):

- Kepala divisi hanya bisa menyetujui laporan mingguan berstatus `MENUNGGU_PERSETUJUAN`.
- Kolom Kendala dan Rencana besok selalu tampil; wajib hanya bila Terkendala atau Menunggu keputusan.
- Kata sandi minimal 8 karakter. Akun yang dibuat atau disetel ulang admin wajib ganti kata sandi saat masuk pertama.
- `GET /api/notifications` hanya mengembalikan notifikasi milik akun itu.
- Di kartu antrean keputusan, tombol per baris sekunder (`ApprovalItem approveVariant="secondary"`); hanya "Terima semua" atau tombol hero yang primer.
- Warna `data-1..6` hanya untuk divisi.
- Lonceng header disembunyikan dalam mode Dock. `devIndicators: false`.

## PIC proyek (`PIC_PROYEK`)

Tab: Ringkasan ("Hari ini") · Meja kerja · Laporan harian · Proyek. Rincian: [peran-pic.md](peran-pic.md).

| Fungsi | Layar | Endpoint | Status | Fase |
| --- | --- | --- | --- | --- |
| Hari ini: hero progres, kalimat kendala dan usulan tenggat, 4 KPI output | `dashboard` | `GET /api/my-dashboard`, `GET /api/outputs` | selesai | 0 → 2 |
| Isi dan kirim laporan harian dari layar Hari ini | `dashboard` (`DailyReportCard`) | `GET/PUT /api/daily-input` | selesai | 2 |
| Isi laporan harian: simpan draf, kirim, kirim ulang sebelum 17.00 | `daily-input` | `GET/PUT/DELETE /api/daily-input` | selesai | 0 → 1 |
| Kendala dan Rencana besok selalu tampil; wajib sesuai status | `daily-input` | `PUT /api/daily-input` (422 `errors[]`) | selesai | 1 |
| Laporan beku setelah diteruskan; kotak kunci di layar | `daily-input`, `dashboard` | `PUT/DELETE /api/daily-input` → 409 `frozen` | selesai | 1 |
| Ajukan buka kunci laporan harian proyek sendiri; lihat statusnya | `daily-input` (`UnlockRequestSheet`) | `POST /api/unlock-requests` (hanya `DAILY_REPORT` proyek sendiri) | selesai | 1 |
| Tugas harian: tambah, ubah, centang (Urungkan), hapus | `work-desk`, `daily-input` | `GET/POST/PUT/DELETE /api/tasks` | selesai | 0 → 1 |
| Papan tugas mingguan proyek, seret-lepas | `daily-input` (Mingguan) | `GET /api/tasks?week=`, `PATCH /api/tasks` | sebagian: API menolak hari yang beku (409) dan mengirim `frozenDays`, tetapi papan belum menandai kolom beku lebih dulu | 1 |
| Lampirkan bukti: unggah, tautan, seret-lepas, "Lampirkan foto" | `daily-input` (`EvidencePanel`) | `GET/POST /api/evidence`, `POST /api/evidence/upload`, `GET/DELETE /api/evidence/[id]` | selesai. Unggah butuh `SUPABASE_SERVICE_ROLE_KEY`; tanpa itu 503 dan hanya tautan yang jalan. | 1 → 4 |
| Bukti laporan lampau yang sedang dibuka bisa ditambah/dihapus | `daily-input` | `src/lib/evidence-access.ts` + `activeUnlockFor` | selesai | 4 |
| Laporan kemajuan mingguan dan bulanan | `daily-input` (Mingguan/Bulanan) | `GET/PUT/DELETE /api/progress-reports` | selesai | 0 |
| Output saya: tambah, unggah bukti & kirim review, tarik (Urungkan), seret berkas ke baris | `dashboard`, `work-desk` | `/api/outputs` (0013) | selesai | 0 → 2 |
| Catatan kepala divisi: baca, balas, status baca per akun | `dashboard` | `/api/project-notes` (0014, 0019) | selesai | 0 → 1 |
| "Tanya kepala divisi" dari Sheet output | `dashboard` (Sheet output) | `POST /api/project-notes` | selesai | 2 |
| Tahapan proyek bertanggal | `dashboard` | `/api/project-stages` (0014) | selesai | 0 |
| Usulkan geser tenggat | `dashboard` (Tahapan) | `POST /api/deadline-proposals` (0014) | selesai | 0 |
| Progres dibanding rencana, tenggat terdekat, riwayat 6 hari kerja | `dashboard` | `GET /api/project-progress` | selesai | 2 |
| Badge nav "Laporan harian 1" dan catatan belum dibaca | navigasi | `GET /api/nav-badges` | selesai | 0 → 2 |
| Ajukan persetujuan materi, anggaran, atau cuti | `work-desk` (Permintaan persetujuan) | `/api/approval-requests`, `/api/approval-requests/berkas` (0023) | selesai | 2 |
| Ajukan permintaan akses untuk diri sendiri atau anggota divisi | `work-desk` (`RequestAccessCard`) | `POST /api/access-requests`, `GET /api/access-requests/options` (0016) | selesai | 2 |
| Ajukan proyek (rantai Admin PT → Direktur), ajukan ulang | `projects` | `POST /api/projects`, `PATCH /api/projects { resubmit }` | selesai | 0 → 2 |
| Ajukan eskalasi dari tugas Terkendala | `daily-input` (kartu tugas) | `POST /api/escalations/actions { raise }` | selesai | 0 |
| Pencarian ⌘K (hanya proyek sendiri) | kerangka | `GET /api/search` | selesai | 2 |
| Item navigasi khusus spesifikasi (Output saya, Tahapan, Catatan, Riwayat) | navigasi | — | belum: butuh perubahan `ROLE_TABS`/`NavTabId` dan kerangka; isinya sudah ada sebagai kartu (desktop) dan tab dalam layar (tablet/ponsel) | — |

## Kepala divisi (`KEPALA_DIVISI`)

Tab: Ringkasan · Meja kerja · Capaian mingguan · Divisi. Rincian: [peran-kadiv.md](peran-kadiv.md).

| Fungsi | Layar | Endpoint | Status | Fase |
| --- | --- | --- | --- | --- |
| Ringkasan: hero, 3 cincin, 4 KPI termasuk "Tepat waktu 30 hari" | `dashboard` | `GET /api/my-dashboard`, `GET /api/kadiv/team` | selesai | 0 → 2 |
| Review output: Terima, Minta revisi dengan catatan, Terima semua, Urungkan | `dashboard`, `work-desk` (`ReviewCard`) | `GET/POST /api/outputs/review` (0013, riwayat 0019) | sebagian: jenis bukti ditulis sebagai jumlah berkas ("2 berkas"), belum per jenis | 0 → 1 → 4 |
| Urungkan "Minta revisi" memulihkan catatan putaran sebelumnya | `dashboard` | `POST /api/outputs/review`, `GET /api/outputs?id=&history=1` (0019) | selesai | 1 → 3 |
| Laporan harian tim: lihat, Ingatkan yang belum, Tandai sudah dibaca (Urungkan) | `dashboard` (Sheet anggota) | `GET/POST /api/kadiv/team` (`remind`, `read`, `unread`; 0021) | selesai | 0 → 2 |
| Atur anggota divisi dan proyek divisi | `dashboard` (Atur anggota) | `GET/PUT /api/kadiv/members` (0015) | selesai | 0 |
| Beban kerja tim, peta panas 10 hari, output per minggu | `dashboard` | `GET /api/kadiv/team` | selesai | 0 → 1 |
| Kehadiran tim: Hadir, Terlambat, Cuti, Sakit, Izin | `dashboard` | `GET/POST/DELETE /api/attendance` (0015, CHECK diperluas 0023) | selesai | 0 → 2 |
| Proyek divisi: Timeline dan Sheet proyek | `dashboard` | `GET /api/kadiv/team` (`projects[]`) | selesai | 2 |
| Ringkasan mingguan untuk Direktur: draf otomatis, sunting, Kirim ke Direktur, tarik kembali | `dashboard` (`WeeklySummaryCard`) | `GET/PUT/POST /api/kadiv/weekly-summary` (0021) | selesai | 2 |
| Isi papan capaian mingguan, seret-lepas (Urungkan), bukti per item | `weekly-input`, `divisions` | `GET/PUT/PATCH/DELETE /api/weekly-input`, `/api/evidence` | selesai | 0 → 1 |
| Serahkan ke Admin PT paling lambat Kamis 17.00 (hanya dari Draf), daftar periksa | `weekly-input`, `work-desk` | `POST /api/weekly-input { submit }` | selesai | 1 |
| Setujui laporan (hanya dari Menunggu persetujuan) | `weekly-input` | `POST /api/weekly-input { approve }` | selesai | 1 |
| Laporan dibekukan setelah diteruskan, kunci Jumat 17.00 | `weekly-input` | `weeklyWriteBlock` → 409 | selesai | 1 |
| Ajukan buka kunci capaian mingguan | `weekly-input` | — | sebagian: kepala divisi tidak punya `unlock:request`; pengajuan lewat Admin PT, dan pengingat menyarankan menghubungi Admin PT | 1 |
| Balas tanggapan direktur | `work-desk` (Tanggapan direktur) | `GET/POST/PATCH /api/weekly-comments` (0023) | selesai | 2 |
| Ajukan persetujuan materi, anggaran, atau cuti | `work-desk` | `/api/approval-requests` (0023) | selesai | 2 |
| Ajukan permintaan akses untuk anggota tim | `work-desk` (`RequestAccessCard`) | `POST /api/access-requests` (0016) | selesai | 2 |
| Ajukan eskalasi dari item mingguan | `weekly-input` | `POST /api/escalations/actions { raise }` | selesai | 0 |
| Arsip laporan mingguan divisi | `divisions` | `GET /api/weekly-reports` | selesai | 0 |
| Aktivitas tim | `dashboard` | `GET /api/kadiv/team` (dari `AuditLog`) | selesai | 0 |
| Pencarian ⌘K (divisi dan tim sendiri) | kerangka | `GET /api/search` | selesai | 2 |
| Tab tablet Ringkasan · Review · Tim · Proyek dan nav khusus | navigasi | — | belum: butuh perubahan `ROLE_TABS`; dasbor memakai susunan responsif | — |

## Admin PT (`ADMIN_PT`)

Tab: Ringkasan · Meja kerja · Laporan harian · Penerimaan · Proyek · Divisi · Eskalasi. Rincian: [peran-admin.md](peran-admin.md).

| Fungsi | Layar | Endpoint | Status | Fase |
| --- | --- | --- | --- | --- |
| Ringkasan kepatuhan per orang: hero, 3 cincin, 4 KPI | `dashboard` | `GET /api/my-dashboard`, `GET /api/admin/compliance` | selesai | 0 → 2 |
| Kepatuhan per divisi (harian/mingguan) dan Sheet divisi | `dashboard` | `GET /api/admin/compliance` | selesai | 2 |
| Ingatkan per orang, per divisi, atau semua | `dashboard` (Sheet divisi, hero) | `POST /api/admin/compliance/remind` | selesai | 2 |
| Hubungi kepala divisi (`tel:`/`mailto:`) | `dashboard` (Sheet divisi) | — | selesai | 2 |
| Peta panas kepatuhan 6 divisi × 10 hari | `dashboard` | `GET /api/admin/compliance` | sebagian: di ponsel label memakai nama lengkap (digeser ke samping), belum 3 huruf | 2 |
| Meja kerja: laporan harian per proyek, Ingatkan PIC / semua | `work-desk` | `GET/POST /api/work-desk` | selesai | 0 → 1 |
| Teruskan laporan harian ke holding (lalu beku), Urungkan | `inbox` | `POST /api/inbox { kind: 'daily' }`, `POST /api/undo` (0025) | selesai | 1 → 2 |
| Teruskan capaian mingguan yang sudah disetujui, Urungkan | `inbox` | `POST /api/inbox { kind: 'weekly' }` (bersyarat, klik ganda → 409) | selesai | 2 → 3 |
| Isi laporan harian atas nama PIC | `daily-input` | `/api/daily-input`, `/api/tasks` | selesai | 0 |
| Isi capaian mingguan divisi | `divisions` | `/api/weekly-input` | selesai | 0 |
| Proyek: ajukan, tanda tangan slot Admin PT, ubah, arsip (Urungkan), hapus | `projects` | `/api/projects`, `POST /api/projects/approve`, `POST /api/undo` | selesai | 0 → 2 |
| Divisi pelaksana proyek di formulir proyek | `projects` (formulir) | `GET /api/projects?options=1`, `POST/PATCH /api/projects { divisionId }` (0015) | selesai | 2 |
| Permintaan akses: ajukan dan putuskan untuk PT sendiri | `dashboard`, `work-desk` | `/api/access-requests` (0016) | selesai | 0 → 4 |
| Pengingat otomatis: 4 sakelar per PT, Urungkan, tercatat di log | `dashboard` | `GET/PATCH /api/admin/reminder-rules` (0016) | sebagian: kode selesai; sakelar harian baru berefek setelah cron `reminder-rules` dipasang di crontab VPS | 0 → 2 |
| Data induk (5 ubin) dan Pengguna per peran | `dashboard` | `GET /api/admin/overview` | selesai | 0 |
| Log aktivitas PT dan "Unduh log" (CSV) | `dashboard` | `GET /api/admin/activity`, `GET /api/audit-logs/export` | selesai | 2 |
| Meja akun terbatas PT: akun Admin PT/Kepala divisi/PIC, setel ulang kata sandi, anggota divisi | `dashboard` → Sheet akun | `/api/companies/users` | sebagian: perubahan peran langsung masih bisa tanpa permintaan (tercatat `UPDATE_ACCOUNT`); spesifikasi meminta selalu lewat persetujuan | 0 → 1 → 2 |
| Ajukan buka kunci laporan harian/mingguan | `work-desk` | `POST /api/unlock-requests` | selesai | 0 |
| Ajukan dan lihat eskalasi PT | `escalations` | `/api/escalations`, `/api/escalations/actions` | selesai | 0 |
| Pencarian ⌘K (PT sendiri) | kerangka | `GET /api/search` | sebagian: palet bisa dibuka dengan ⌘K/Ctrl+K, tetapi kolom cari di header Admin belum ada | 2 |
| Nav khusus (Kepatuhan · Akses · Pengguna · Data induk · Log · Pengingat), tab tablet | navigasi | — | belum: butuh perubahan `ROLE_TABS` dan kerangka; isinya sudah ada sebagai kartu | — |

## Direktur entitas (`DIREKTUR_ENTITAS`)

Tab: Ringkasan · Proyek · Divisi · Persetujuan · Eskalasi · Entitas. Tablet dan ponsel: Ringkasan · Proyek · Eskalasi · Divisi. Rincian: [peran-direktur-manajemen.md](peran-direktur-manajemen.md).

| Fungsi | Layar | Endpoint | Status | Fase |
| --- | --- | --- | --- | --- |
| Ringkasan dengan saringan divisi, hero "n persetujuan dan n eskalasi menunggu", 4 KPI | `dashboard` | `GET /api/ringkasan` | selesai | 0 → 2 → 4 |
| Laporan mingguan divisi: lencana, baca, Tandai sudah dibaca (Urungkan) | `dashboard` | `GET /api/ringkasan`, `POST/DELETE /api/ringkasan/laporan-dibaca` (0017) | selesai | 0 |
| Poin ringkasan dari kepala divisi di laporan mingguan | `dashboard` (Sheet laporan) | `GET /api/ringkasan` (`readDivisionSummaries`, 0021) | selesai | 2 |
| Beri tanggapan pada laporan mingguan (Urungkan 15 menit) | `dashboard` (Sheet laporan) | `/api/weekly-comments` (0023) | selesai | 2 |
| Hubungi kepala divisi; Ingatkan satu divisi untuk minggu yang tampil | `dashboard` (Sheet laporan belum masuk) | `POST /api/notifications/remind { divisionId, week }` | selesai | 1 → 2 |
| Persetujuan materi, anggaran, cuti: Setujui, Tolak dengan alasan, Urungkan, buka berkas | `approvals`, `dashboard` | `GET/PATCH /api/approval-requests`, `GET /api/approval-requests/berkas` (0023) | selesai | 2 |
| Keputusan usulan geser tenggat (Urungkan) | `approvals`, `dashboard` | `PATCH /api/deadline-proposals` (0014) | selesai | 0 → 2 |
| Tanda tangan slot Direktur pada pengajuan proyek (Urungkan) | `approvals`, `projects` | `POST /api/projects/approve`, `POST /api/undo` (0025) | selesai | 0 → 2 |
| Detail proyek: tahapan bertanggal, Kirim catatan ke PIC, Tandai sudah ditinjau | `dashboard`, `projects` (`ProjectSheet`) | `/api/project-stages`, `/api/project-notes`, `/api/project-reviews` (0023) | selesai | 2 |
| Eskalasi: tinjau, tutup, Urungkan | `escalations` | `/api/escalations/actions` | selesai | 0 → 2 |
| Output yang dikerjakan, milestone, tren output, tepat waktu per divisi | `dashboard` | `GET /api/ringkasan` | selesai | 0 |
| Entitas: pohon PT dan Sheet detail | `entities` | `GET /api/entities`, `GET /api/entities/[id]`, `GET /api/entity-activity` | selesai | 0 |
| Badge nav Persetujuan, Eskalasi, Laporan mingguan (di Divisi) | navigasi | `GET /api/nav-badges` | selesai | 2 |
| Pencarian ⌘K | kerangka, header dasbor | `GET /api/search` | selesai | 2 |
| Log aktivitas PT | — | `GET /api/audit-logs` | sebagian: kapabilitas `audit:read` ada, tetapi tab Log aktivitas tidak ada di `ROLE_TABS` | 0 |
| Tab terpisah Laporan mingguan dan Milestone; badge jumlah proyek | navigasi | — | belum: isinya tampil sebagai kartu di Ringkasan; badge proyek sengaja tidak dibuat | — |

## Direksi holding SDM & GA (`DIREKTUR_SDM_GA`)

Tab: Ringkasan · Proyek · Divisi · Eskalasi · Entitas · Log aktivitas. Rincian: [peran-grup.md](peran-grup.md).

| Fungsi | Layar | Endpoint | Status | Fase |
| --- | --- | --- | --- | --- |
| Ringkasan susunan Manajemen | `dashboard` | `GET /api/ringkasan` | selesai | 0 |
| Kepatuhan pelaporan per PT, beban kerja PIC, izin/sakit/cuti hari ini | `dashboard` (`SdmPanel`) | `GET /api/system/grup` | sebagian: ambang Terlambat/Perlu perhatian dan Berlebih/Tinggi adalah keputusan orkestrator, belum dikonfirmasi pemilik produk | 2 |
| Laporan mingguan menunggu dibaca: baca, tanggapi, tandai dibaca | `dashboard` | `/api/ringkasan/laporan-dibaca`, `/api/weekly-comments` | selesai | 2 |
| Ingatkan divisi yang belum menyerahkan | `dashboard` (Sheet PT) | `POST /api/notifications/remind` | selesai | 2 |
| Setujui atau tolak permintaan buka kunci | `dashboard` (`UnlockCard`) | `GET/PATCH /api/unlock-requests` | selesai | 2 |
| Keputusan cuti, materi, anggaran | `dashboard` (Persetujuan menunggu) | `/api/approval-requests` (0023) | sebagian: bisa diputuskan dari kartu di Ringkasan, tetapi peran ini belum punya tab Persetujuan | 2 |
| Tanda tangan slot Manajemen pada pengajuan proyek | `projects`, `dashboard` | `POST /api/projects/approve` | selesai | 0 |
| Ajukan dan tindak lanjuti eskalasi (tidak memutuskan) | `escalations` | `/api/escalations/actions` | selesai | 0 |
| Log aktivitas seluruh grup, saringan peran dan tanggal, Unduh CSV | `audit` | `GET /api/audit-logs`, `GET /api/audit-logs/export` | selesai | 2 |
| Entitas | `entities` | `/api/entities` | selesai | 0 |

## Manajemen (`MANAJEMEN`)

Tab: Ringkasan · Proyek · Divisi · Persetujuan · Eskalasi · Entitas · Log aktivitas. Tablet dan ponsel: Ringkasan · Proyek · Persetujuan · Divisi. Rincian: [peran-direktur-manajemen.md](peran-direktur-manajemen.md).

| Fungsi | Layar | Endpoint | Status | Fase |
| --- | --- | --- | --- | --- |
| Ringkasan: periode Minggu/Bulan/Kuartal, cincin, 4 KPI, output 8 periode, perlu perhatian, kinerja divisi | `dashboard` | `GET /api/ringkasan` | selesai | 0 → 2 |
| Kehadiran hari ini dengan kategori Terlambat | `dashboard` | `GET /api/ringkasan` (0015, 0023) | selesai | 2 |
| Persetujuan: materi/anggaran/cuti, pengajuan proyek, usulan tenggat (Urungkan) | `approvals`, `dashboard` | `/api/approval-requests`, `/api/projects/approve`, `/api/deadline-proposals`, `/api/undo` | selesai | 2 |
| Putuskan eskalasi (Urungkan) | `escalations` | `POST /api/escalations/actions { decide }` | selesai | 0 → 2 |
| Laporan mingguan divisi: baca, tanggapi, tandai dibaca | `dashboard` | `/api/ringkasan/laporan-dibaca`, `/api/weekly-comments` | selesai | 0 → 2 |
| Detail proyek: tinjau, kirim catatan ke PIC | `dashboard`, `projects` | `/api/project-reviews`, `/api/project-notes` | selesai | 2 |
| Log aktivitas dan Unduh CSV | `audit` | `GET /api/audit-logs`, `/export` | selesai | 2 |
| Entitas | `entities` | `/api/entities` | selesai | 0 |
| Pencarian ⌘K, badge Persetujuan dan Eskalasi, tab ringkas tablet/ponsel | kerangka | `/api/search`, `/api/nav-badges` | selesai | 2 |
| Delta "Rata-rata progres +n poin" | `dashboard` | — | belum: riwayat progres mingguan tidak disimpan; tile menulis "n proyek selesai" | — |
| Tab terpisah Aktivitas dan Kehadiran; badge jumlah proyek | navigasi | — | belum: tampil sebagai kartu di Ringkasan | — |

## Tim TI (`TI`)

Tab: semua kecuali Perusahaan & akun dan Persetujuan. Rincian: [peran-grup.md](peran-grup.md), [sistem.md](sistem.md).

| Fungsi | Layar | Endpoint | Status | Fase |
| --- | --- | --- | --- | --- |
| Ringkasan bisnis dengan kartu ringkas teknis | `dashboard` (`TechnicalStrip`) | `GET /api/ringkasan`, `GET /api/system/grup` | selesai | 2 |
| Sistem & akses: kesehatan, proses otomatis, penguncian, kesehatan akun, hak per peran | `system` | `GET /api/system` | selesai | 0 → 2 |
| Buka kunci: setujui, tolak, jalankan, kunci lagi | `system` (`UnlockCard`) | `GET/PATCH /api/unlock-requests` | selesai | 0 → 2 |
| Putuskan permintaan akses (kecuali yang menyangkut Super Admin) | `system` | `GET/PATCH /api/access-requests` (0016) | sebagian: tombol "Ajukan permintaan" tampil untuk TI, tetapi formulirnya memuat `/api/companies` yang menolak TI (403) | 0 → 4 |
| Pengingat otomatis per perusahaan (Urungkan) | `system` (`ReminderMatrixCard`) | `PATCH /api/admin/reminder-rules { entityId }` | selesai | 2 |
| Semua modul isian dan penerusan atas nama PT mana pun | `work-desk`, `inbox`, `daily-input`, `weekly-input`, `divisions` | sama dengan Admin PT dan Kepala divisi | selesai | 0 |
| Tanda tangan slot proyek mana pun; putuskan eskalasi | `projects`, `escalations` | `/api/projects/approve`, `/api/escalations/actions` | selesai | 0 |
| Log aktivitas dan Unduh CSV | `audit` | `/api/audit-logs`, `/export` | selesai | 2 |
| Ponsel tanpa aksi massal | semua | — | sebagian: tidak ada aksi massal, tetapi sakelar pengingat per PT tetap bisa dipakai di ponsel | 2 |
| Pasang jadwal cron di VPS | — | `deploy/app-vps/cron.sh` | belum: perlu dipasang manusia di crontab host | — |

## Auditor (`AUDITOR`)

Tab: Ringkasan · Proyek · Divisi · Entitas · Log aktivitas. Rincian: [peran-grup.md](peran-grup.md).

| Fungsi | Layar | Endpoint | Status | Fase |
| --- | --- | --- | --- | --- |
| Ringkasan hanya-baca: laporan terlambat, ringkasan jejak audit, buka kunci 30 hari | `dashboard` (`AuditPanel`) | `GET /api/system/grup` | selesai | 2 |
| Kartu "Keputusan terbuka" (eskalasi baca saja) | `dashboard` | `GET /api/ringkasan` | sebagian: isinya benar, tetapi subjudul kartu masih menyebut materi, anggaran, cuti, pengajuan proyek, dan usulan tenggat | 2 |
| Klik eskalasi membuka Log aktivitas | `dashboard` | — | selesai | 2 |
| Log aktivitas: saringan peran dan rentang tanggal, Sheet saringan di ponsel, Unduh CSV | `audit` | `GET /api/audit-logs`, `GET /api/audit-logs/export` | sebagian: di ponsel memakai baris kartu log, belum `ActivityItem` | 2 |
| Baca Proyek, Divisi, Entitas | `projects`, `divisions`, `entities` | `/api/projects`, `/api/weekly-reports`, `/api/entities` | selesai | 0 |
| Hanya-baca di semua API | — | `tests/api/auditor-readonly.test.ts` memeriksa setiap route tulis | selesai | 2 |

## Super Admin (`SUPERADMIN`)

Tab: semua kecuali Persetujuan. Rincian: [perusahaan-akun.md](perusahaan-akun.md), [peran-grup.md](peran-grup.md).

| Fungsi | Layar | Endpoint | Status | Fase |
| --- | --- | --- | --- | --- |
| Perusahaan & akun: tambah perusahaan (wizard), ubah, struktur | `companies` | `/api/companies` | selesai | 0 |
| Akun: buat, ubah posisi, nonaktifkan, setel ulang kata sandi (penerima wajib ganti saat masuk) | `companies` (Sheet akun) | `/api/companies/users` (0018) | selesai | 0 → 1 |
| Keanggotaan divisi pada akun | `companies` (Sheet akun) | `PATCH /api/companies/users { memberDivisionId }` (0015) | selesai | 2 |
| Ringkasan dengan strip Perusahaan & akun dan kartu teknis | `dashboard` | `/api/ringkasan`, `/api/system/grup` | selesai | 2 |
| Putuskan permintaan akses untuk semua posisi | `system` | `/api/access-requests` | selesai | 0 |
| Sistem & akses, buka kunci, pengingat per PT | `system` | sama dengan TI | selesai | 0 → 2 |
| Semua modul lain | semua tab | sama dengan TI | selesai | 0 |

## Lintas peran

| Fungsi | Peran | Layar | Endpoint | Status | Fase |
| --- | --- | --- | --- | --- | --- |
| Masuk, keluar, sesi HMAC yang dimuat ulang setiap permintaan | semua | `/login` | `/api/auth/login`, `/api/auth/logout`, `/api/auth/me` | selesai | 0 |
| Wajib ganti kata sandi saat masuk pertama; API lain 403 `MUST_CHANGE_PASSWORD` | akun buatan/setelan ulang admin | `/login/ganti-sandi` | `POST /api/profile/password` (0018) | sebagian: belum dicoba dengan akun sungguhan; menulis kolom gagal sampai 0018 diterapkan | 1 |
| Profil dan ganti kata sandi sendiri (minimal 8 karakter) | semua | Pengaturan | `GET/PATCH /api/profile`, `POST /api/profile/password` | selesai | 0 → 1 |
| Notifikasi lonceng milik sendiri, tandai dibaca | semua | header, Dock | `GET/PATCH /api/notifications` | selesai | 0 → 1 |
| Urungkan keputusan proyek, eskalasi, ajukan ulang, arsip, penerusan (15 menit) | Admin PT, pengawas, TI, Super Admin | toast | `POST /api/undo` (0025) | selesai: tanpa 0025 toast tampil tanpa tombol Urungkan | 2 |
| Tampilan: tema, aksen, Sidebar/Dock, Dock sembunyi otomatis | semua | panel Tampilan | localStorage | selesai | 0 |
| Pratinjau tanpa basis data untuk 9 peran, semua tab | pengembang | `/pratinjau?peran=` | `src/components/preview/*` | selesai: 62 tab dari 9 peran termuat tanpa galat | 3 |
| Pekerjaan terjadwal: pengingat mingguan, aturan pengingat, cuplikan KPI | sistem | — | `/api/cron/remind-divisions`, `/api/cron/reminder-rules`, `/api/cron/kpi-snapshot` | sebagian: kode dan skrip `cron.sh` siap; crontab VPS belum dipasang | 1 |

## Ketergantungan migrasi

| Migrasi | Fungsi yang menunggu |
| --- | --- |
| 0013 | Output saya, review output |
| 0014 | Catatan, tahapan, usulan tenggat |
| 0015 | Anggota divisi, divisi pelaksana, kehadiran, laporan harian tim, kepatuhan per orang. **Tanpa 0015 kueri `User`/`Project` gagal.** |
| 0016 | Permintaan akses, pengingat otomatis |
| 0017 | Tandai laporan mingguan sudah dibaca |
| 0018 | Wajib ganti kata sandi, pembuatan dan setel ulang akun. **Tanpa 0018 kueri `User` gagal.** |
| 0019 | Status baca catatan per akun, riwayat revisi output |
| 0021 | Ringkasan mingguan untuk Direktur, tanda baca laporan harian oleh kepala divisi |
| 0023 | Tanggapan laporan mingguan, tinjauan proyek, persetujuan materi/anggaran/cuti, kehadiran Terlambat |
| 0025 | Tombol Urungkan untuk keputusan proyek, eskalasi, dan penerusan |
