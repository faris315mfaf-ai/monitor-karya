# Peran grup: Direksi holding SDM & GA, Tim TI, Super Admin, Auditor

[← Indeks](README.md) · Spesifikasi: [`06-direktur-sdm-ga.md`](../design/peran/06-direktur-sdm-ga.md), [`07-ti.md`](../design/peran/07-ti.md), [`08-auditor.md`](../design/peran/08-auditor.md)

Dikerjakan pada fase F2 (wilayah `[F2-GRUP]`), 6 Oktober 2026. Tidak ada model atau migrasi baru: semua data dibaca dari tabel yang sudah ada.

## Ringkasan

Keempat peran memakai layar Manajemen (`ManagementDashboard`), sesuai spesifikasinya. Di bawah kartu "Persetujuan menunggu" dan "Aktivitas terbaru", dan di atas "Aktivitas per perusahaan", ada satu bagian khusus per peran: `GroupRolePanel` di `src/components/group/group-panel.tsx`. Datanya dari `GET /api/system/grup`.

| Peran | Bagian khusus | Isi |
| --- | --- | --- |
| Direksi holding SDM & GA | `SdmPanel` | Kepatuhan pelaporan per perusahaan (tabel, ponsel jadi daftar, Sheet rincian dengan "Ingatkan n divisi"). Beban kerja PIC. Laporan mingguan menunggu dibaca (Sheet laporan dengan "Tandai sudah dibaca"). Izin, sakit, dan cuti hari ini, dengan pintasan ke pengajuan cuti yang menunggu. Buka kunci (setujui atau tolak). |
| Tim TI, Super Admin | `TechnicalStrip` | Satu kartu: buka kunci, proses otomatis, akun, permintaan akses. Satu tombol primer, "Buka Sistem & akses". |
| Auditor | `AuditPanel` | Laporan terlambat per perusahaan beserta yang terbaru. Ringkasan jejak audit (24 jam, 7 hari, perubahan hak & kunci, aksi terbanyak). Buka kunci yang dijalankan dalam 30 hari. Tombol "Telusuri log aktivitas" dan "Unduh log 30 hari". |

Kalimat jawaban di atas layar tetap jawaban bisnis ("x dari y proyek berjalan sesuai rencana."). Hero tetap 4 KPI. Bagian khusus tidak memakai `StatTile` atau kartu bergradien, sehingga batas 4 KPI dan 1 kartu bergradien per layar tetap terpenuhi.

### Aturan

Semua aturan berupa fungsi murni di `src/lib/group-panel.ts`, dan dites di `tests/lib/group-panel.test.ts`.

- **Kepatuhan per PT** (`entityCompliance`):
  - *Terlambat* bila tepat waktu 30 hari di bawah 70%, atau separuh divisi atau lebih belum menyerahkan laporan mingguan.
  - *Perlu perhatian* bila tepat waktu di bawah 85%, ada laporan mingguan yang belum masuk, atau ada eskalasi terbuka.
  - Label lencana di tabel: alasan singkat ("2 mingguan belum masuk", "1 eskalasi terbuka", "Tepat waktu 79%", "Patuh").
  - Minggu laporan sama dengan `/api/ringkasan`: minggu berjalan bila tenggat serah Kamis 17.00 WIB sudah lewat, selain itu minggu lalu.
- **Beban kerja** (`workloadLevel`): hitungan per PIC = proyek AKTIF ditambah tugas terbuka minggu ini.
  - *Berlebih*: 6 proyek atau lebih, atau 15 tugas atau lebih.
  - *Tinggi*: 4 proyek atau lebih, atau 10 tugas atau lebih.
  - Ambang ini keputusan orkestrator, belum dikonfirmasi pemilik produk.
- **Proses otomatis** (`CRON_JOBS`, `cronHealth`): jalan terakhir tiap job dibaca dari `AuditLog`:
  - `AUTO_REMINDER`, ditambah `ReminderRule.lastRunAt`;
  - `CRON_DIVISION_REMINDERS`;
  - `KPI_SNAPSHOT`.

  Job dinyatakan terlambat bila melewati jendelanya: 74 jam untuk pengingat (melewati akhir pekan) dan 26 jam untuk cuplikan KPI. Jadwal cron ada di `deploy/app-vps/cron.sh` (VPS, bukan Vercel).
- **Hanya-baca** (`isReadOnlyRole`): peran yang hanya memegang `audit:read` dan/atau `group:read`. Saat ini hanya Auditor.

## Sistem & akses (TI, Super Admin)

Lihat [sistem.md](sistem.md). Konsol kini memuat:

- antrean buka kunci (`UnlockCard`: setujui, tolak, buka laporan, kunci lagi);
- permintaan akses (`AccessRequestsCard`);
- proses otomatis;
- mekanisme penguncian;
- pengingat otomatis per perusahaan (`ReminderMatrixCard`). Sakelar berlaku seketika, tercatat di log, dan bisa diurungkan lewat toast;
- kesehatan akun: belum pernah masuk, wajib ganti kata sandi, tanpa kata sandi;
- hak akses per peran, volume data, dan aktivitas.

## Log aktivitas (Auditor dan pemegang `audit:read`)

- Saringan baru: peran pelaku dan rentang tanggal WIB (`role`, `dateFrom`, `dateTo` berformat `YYYY-MM-DD`; `dateTo` mencakup seluruh hari).
- Di ponsel, saringan pindah ke Sheet "Saring log".
- Tombol "Unduh CSV" memakai `/api/audit-logs/export` milik `[F2-ADMIN]`, dengan rentang tanggal dan aksi yang sama.
- Cakupan baca `GET /api/audit-logs` kini memakai `auditScopeWhere` (`src/lib/audit-scope.ts`), sama dengan unduhan. Direktur entitas ikut melihat pekerjaan terjadwal PT-nya.
- Galat 500 tidak lagi membawa pesan mentah.

## Auditor benar-benar hanya-baca

- `tests/api/auditor-readonly.test.ts` membaca semua `src/app/api/**/route.ts` saat tes berjalan, jadi route baru ikut diperiksa.
  - Setiap POST/PUT/PATCH/DELETE dipanggil sebagai AUDITOR dengan 14 variasi `action`. Basis data diganti Proxy yang mencatat setiap tulis.
  - Tes gagal bila ada tulis atau jawaban 2xx.
  - Yang dikecualikan: login/logout, profil sendiri, kata sandi sendiri, dan menandai notifikasi sendiri sudah dibaca. Route cron juga dikecualikan karena memakai `CRON_SECRET`.
  - Pemeriksaan silang: dijalankan sebagai SUPERADMIN, harness menangkap tulis di 21 route. Jadi harness memang mencapai jalur tulis.
- Satu celah ditutup: `POST /api/access-requests` sebelumnya menerima pengajuan dari peran apa pun, termasuk Auditor. Kini peran hanya-baca ditolak 403.
- Di UI, Auditor tidak melihat tombol yang mengubah data:
  - `ProjectSheet` hanya "Buka modul proyek";
  - tidak ada "Ingatkan" atau "Tandai sudah dibaca";
  - `UnlockCard` tidak dipasang untuknya;
  - klik eskalasi membuka tab Log aktivitas.

## Endpoint

| Metode & path | Jawaban | Izin |
| --- | --- | --- |
| `GET /api/system/grup` | `{ kind: 'SDM' \| 'TEKNIS' \| 'AUDIT', … }` (tipe di `src/lib/group-panel.ts`) | DIREKTUR_SDM_GA, TI, SUPERADMIN, AUDITOR; selain itu 403 |
| `GET /api/system` | Konsol + `technical` + `reminders` | `users:manage` (TI, Super Admin) |
| `GET /api/audit-logs` | `{ items, total, page, pageSize, canExport }` | sesi; tanpa `audit:read` hanya jejak sendiri |
| `PATCH /api/admin/reminder-rules` | dipakai `ReminderMatrixCard` dengan `entityId` | akun induk untuk PT mana pun |

Data yang mungkin belum ada di basis data (migrasi 0015–0018 belum diterapkan) dibaca lewat `optional`, sehingga panel tetap tampil:

- `Attendance`;
- `AccessRequest`;
- `ReminderRule`;
- `User.mustChangePassword`.

Nilainya tampil sebagai "belum tersedia".

## Pratinjau

`/pratinjau?peran=DIREKTUR_SDM_GA|TI|SUPERADMIN|AUDITOR` memakai `src/components/preview/mock-group.ts`, yang menyediakan:

- `/api/system/grup`, `/api/system`, `/api/audit-logs`, `/api/entities`, dan `/api/entities/[id]` (untuk semua peran);
- antrean buka kunci, khusus peran grup.

## Status butir spesifikasi

Tanda: **ada** = dikerjakan dan diperiksa tsc/eslint/vitest; **sebagian** = ada dengan batasan; **belum** = tidak dikerjakan.

### 06 · Direksi holding SDM & GA

| Butir | Status | Catatan |
| --- | --- | --- |
| Tab Ringkasan · Proyek · Divisi · Eskalasi · Entitas · Log aktivitas | ada | `ROLE_TABS` |
| Header, hero, cincin, 4 KPI, Output/Perlu perhatian/Timeline/Donat/Prioritas/Kinerja divisi | ada | `ManagementDashboard` |
| Menandatangani slot Manajemen pada pengajuan proyek | ada | `PROJECT_SLOT_SIGNERS.MANAJEMEN` |
| Usulan geser tenggat tidak tampil | ada | `canDecideDeadline` |
| Eskalasi terbuka sebagai `AttentionItem` → tab Eskalasi | ada | |
| Menindaklanjuti & membuat eskalasi, tidak memutuskan | ada | `escalation:raise/followup` |
| Mengirim pengingat ke divisi yang belum melapor | ada | Sheet rincian PT ("Ingatkan n divisi") dan Sheet laporan mingguan |
| Menyetujui permintaan buka kunci | ada | Sebelumnya tidak ada UI untuk peran ini; kini `UnlockCard` di Ringkasan |
| Menandai laporan mingguan "Sudah dibaca" | ada | Sebelumnya tidak ada UI di layar Manajemen; kini kartu "Laporan mingguan menunggu dibaca" |
| Kehadiran, beban kerja, kepatuhan lintas PT | ada | `SdmPanel` |
| Keputusan cuti | ada | `ApprovalRequest` CUTI dari `[F2-DIREKTUR]` diputuskan di kartu "Persetujuan menunggu" layar yang sama (SDM GA termasuk pemutus). Kartu izin/cuti `[F2-GRUP]` hanya menghitung yang menunggu dan memberi tombol "Tinjau pengajuan cuti". Kartu keputusan terpisah sempat dibuat lalu dibuang, supaya tidak ada dua jalur keputusan untuk butir yang sama |
| Tablet & ponsel | ada | Diperiksa di pratinjau 768 dan 375 px tanpa gulir mendatar. Di ponsel tabel kepatuhan jadi daftar dengan lencana tetap (Terlambat, Perlu perhatian, Patuh). Di tablet (<1024 px) kolom Hadir disembunyikan (angkanya tetap di Sheet rincian), supaya lencana status muat |

### 07 · Tim TI

| Butir | Status | Catatan |
| --- | --- | --- |
| Tab sampai Sistem & akses | ada | `ROLE_TABS` |
| Ringkasan = susunan Manajemen, kalimat bisnis | ada | Ditambah satu kartu ringkas teknis yang membuka tab Sistem & akses. Ini menyimpang dari "status teknis dibaca di tab Sistem", tetapi kalimat jawaban tetap bisnis |
| Tanda tangan slot mana pun, eskalasi diputuskan di tab Eskalasi | ada | akun induk |
| Tidak ada "Tandai sudah dibaca" | ada | `READERS` tidak memuat TI |
| Eksekusi buka kunci | ada | `UnlockCard` di Sistem & akses |
| Kesehatan sistem, akun, pengingat, cron terakhir | ada | `/api/system` `technical` + `reminders` |
| Ponsel: terbaca, tanpa aksi massal | sebagian | Diperiksa di pratinjau 375 px tanpa gulir mendatar. Tidak ada aksi massal. Sakelar per PT tetap bisa dipakai di ponsel |

### 08 · Auditor

| Butir | Status | Catatan |
| --- | --- | --- |
| Tab Ringkasan · Proyek · Divisi · Entitas · Log aktivitas | ada | |
| Hero: tombol primer hanya navigasi | ada | |
| "Keputusan terbuka": eskalasi baca saja, tanpa pengajuan/usulan | sebagian | Isinya benar. Subjudul kartu di `management-dashboard.tsx` (milik `[F2-DIREKTUR]`) masih menyebut materi, anggaran, cuti, pengajuan proyek, dan usulan tenggat, walau Auditor hanya melihat eskalasi |
| Tidak bisa menandai dibaca / mengirim pengingat | ada | |
| Detail proyek di Sheet hanya navigasi | ada | `isProjectOverseer` tidak memuat AUDITOR |
| Klik eskalasi → Log aktivitas | ada | |
| Hanya-baca di semua API | ada | `tests/api/auditor-readonly.test.ts` |
| Jejak audit, laporan terlambat, ekspor | ada | `AuditPanel`, saringan log, "Unduh CSV" |
| Log di ponsel: saringan di Sheet | sebagian | Memakai baris kartu log yang sudah ada, bukan `ActivityItem` |

### Super Admin

| Butir | Status | Catatan |
| --- | --- | --- |
| Strip Perusahaan & akun di Ringkasan | ada | `SuperadminStrip` (sudah ada) |
| Status teknis di Ringkasan + Sistem & akses | ada | sama dengan TI |
| Meja Perusahaan & akun | ada | Tidak diubah pada fase ini. Lihat [perusahaan-akun.md](perusahaan-akun.md) |

## Batasan yang diketahui

- `AccessRequestsCard` (milik Admin) selalu menampilkan "Ajukan permintaan". Untuk TI, formulirnya memuat `/api/companies`, yang menolak TI (403). TI memutuskan permintaan; mengajukan dilakukan Admin PT.
- Pengingat otomatis hanya tercatat saat ada aturan yang berjalan. Hari tanpa aturan yang jatuh tempo tidak meninggalkan jejak, jadi "terakhir berjalan" bisa terlihat lebih tua dari jalannya cron yang sebenarnya.
- Kartu "Permintaan akses" (milik Admin) memakai tombol primer "Setujui" di setiap baris, jadi di Sistem & akses ada lebih dari satu tombol primer dalam satu kartu. Tidak diubah karena berkasnya bukan milik `[F2-GRUP]`.
- Tidak ada yang diuji terhadap basis data sungguhan. Semua jalur basis data baru hanya diperiksa dengan tsc dan tes ber-mock.
