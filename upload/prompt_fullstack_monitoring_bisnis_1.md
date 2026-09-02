# PROMPT: Aplikasi Web Pemantauan Kerja Multi-Entitas ("Pelaporan Checklist Berbasis Web")

Anda adalah senior fullstack engineer. Bangun aplikasi web internal untuk sebuah holding yang memiliki hingga **1.000+ anak perusahaan (PT)**. Owner/Manajemen hanya memantau lewat web. Data diinput dari bawah oleh Admin PT di tiap entitas, divalidasi dan dikunci otomatis oleh sistem, lalu ditinjau berjenjang sampai ke Manajemen.

Kerjakan **secara bertahap sesuai urutan fase di bagian 12**. Di setiap fase: buat skema DB + migrasi, API/server actions, UI, seed data, dan test minimal. Jangan lompat fase. Setelah tiap fase selesai, ringkas apa yang dibuat dan tunggu konfirmasi sebelum lanjut.

---

## 1. Stack & Konvensi Teknis

- **Next.js 15 (App Router) + TypeScript strict**, React Server Components untuk halaman baca, Server Actions untuk mutasi, Route Handlers hanya untuk webhook/cron/ekspor.
- **PostgreSQL** + **Prisma** (migrasi versi-terkontrol). Boleh dijalankan di Supabase, tetapi jangan bergantung pada fitur khusus Supabase selain Postgres dan Storage.
- **Auth**: Auth.js (NextAuth v5) dengan provider Email OTP (magic link/kode 6 digit) dan Credentials (email + password) untuk peran Holding; sesi berbasis JWT di cookie HttpOnly + Secure + SameSite=Lax. 2FA TOTP wajib untuk peran Holding ke atas.
- **UI**: Tailwind CSS + shadcn/ui, tabel dengan TanStack Table (server-side pagination/sort/filter), form dengan react-hook-form + Zod. Bahasa antarmuka: **Bahasa Indonesia**. Responsif (Admin PT sering pakai HP).
- **Validasi**: skema Zod dibagi antara client dan server; server adalah sumber kebenaran.
- **Penyimpanan bukti**: S3-compatible object storage (Supabase Storage / MinIO / R2) via presigned URL; DB hanya menyimpan metadata.
- **Job terjadwal**: worker terpisah (BullMQ + Redis) atau pg-boss di Postgres — pilih pg-boss jika ingin minim infrastruktur. Job harus **idempoten** dan tahan dijalankan ulang.
- **Notifikasi**: abstraksi `NotificationChannel` dengan implementasi Email (Resend/SMTP) dan WhatsApp (adapter provider, mock di dev). Semua notifikasi masuk tabel `notification_log`.
- **Zona waktu**: seluruh batas waktu dihitung di **Asia/Jakarta (WIB)**; simpan timestamp UTC di DB, konversi di lapisan aplikasi.
- **Observabilitas**: logging terstruktur (pino), request-id, error boundary; endpoint `/api/health`.
- **Kualitas**: ESLint + Prettier, Vitest untuk unit (terutama mesin validasi & KPI), Playwright untuk 3–5 alur E2E kritis.
- **Struktur repo**: `app/`, `components/`, `lib/` (domain: `auth`, `rbac`, `validation`, `locking`, `kpi`, `notification`), `prisma/`, `jobs/`, `tests/`. Domain logic tidak boleh bergantung pada Next.js (agar bisa diuji murni).

---

## 2. Aktor & Peran (RBAC)

Model otorisasi: **peran × cakupan (scope)**. Satu user bisa punya banyak `assignment`; tiap assignment = `role` + `entity_id` (simpul di pohon entitas). Hak berlaku ke simpul tersebut **dan seluruh turunannya**.

| Kode peran | Cakupan tipikal | Hak inti |
|---|---|---|
| `ADMIN_PT` | 1 entitas tipe PT | Input & ubah data yang belum terkunci pada entitasnya; unggah bukti; ajukan proyek baru; unduh laporan entitasnya. **Tidak bisa menyetujui.** |
| `KEPALA_DIVISI` | 1 divisi pada 1 PT | Lihat isian divisinya; **menyetujui secara elektronik** isian mingguan divisinya sebelum kunci. Tidak bisa input. |
| `PIC_PROYEK` | 1 proyek | Lihat isian proyeknya; boleh menambah komentar. Tidak bisa input. |
| `DIREKTUR_ENTITAS` | 1+ PT atau simpul grup (sub-holding/sektor/wilayah) | Lihat semua data di cakupannya; tulis catatan; buat eskalasi; setujui proyek baru; tinjau item Terkendala. |
| `DIREKTUR_SDM_GA` | Holding (root) | Semua hak Direktur Entitas untuk seluruh grup + kelola daftar induk grup + setujui permohonan buka kunci + uji petik + susun laporan ke Manajemen. |
| `MANAJEMEN` | Holding (root) | Read-only seluruh data + **memutuskan eskalasi**. |
| `TI` | Global | Kelola akun & assignment, kalender kerja, eksekusi buka kunci yang sudah disetujui, backup/restore. **Tidak boleh membaca isi laporan** (hanya metadata). |
| `AUDITOR` | Holding (root) | Read-only seluruh data + audit trail. Tidak bisa menulis apa pun. |

**Aturan keras yang dipaksa oleh sistem (bukan sekadar kebijakan):**
1. Satu user **tidak boleh** memegang `ADMIN_PT` dan `KEPALA_DIVISI`/`PIC_PROYEK` pada entitas yang sama (pemisahan input–setuju). Tolak saat assignment dibuat.
2. Tidak ada peran yang dapat mengedit data terkunci secara langsung, termasuk `TI` dan `DIREKTUR_SDM_GA`. Satu-satunya jalur: alur permohonan buka kunci (bagian 7).
3. `TI` tidak mendapat akses ke isi field laporan (capaian, kendala, bukti). Terapkan di lapisan query (kolom tidak diseleksi), bukan hanya di UI.
4. Setiap pemeriksaan hak dilakukan di server (helper `can(user, action, resource)`), tidak pernah hanya di client.
5. **Delegasi sementara**: `KEPALA_DIVISI` dan `DIREKTUR_ENTITAS` bisa mendelegasikan perannya ke user lain dengan rentang tanggal, alasan, dan tercatat di audit. Delegasi tidak boleh melanggar aturan 1.

Autentikasi: Admin PT login via email + OTP; peran Holding wajib password + TOTP. Akun tidak aktif 30 hari dinonaktifkan otomatis oleh job. Semua login/logout/gagal login masuk audit.

---

## 3. Model Data (Prisma) — entitas inti

Buat skema Prisma dengan minimal entitas berikut (tambahkan indeks yang wajar; semua tabel punya `id` (cuid/uuid), `created_at`, `updated_at`; tabel transaksi punya `created_by`, `updated_by`).

**Organisasi**
- `Entity` — `parent_id` (self-relation, nullable untuk root), `type` enum {`HOLDING`,`SUB_HOLDING`,`SECTOR`,`REGION`,`PT`,`UNIT`}, `code` unik, `name`, `is_active`, `path` (materialized path string, mis. `/root/sh1/pt42/`) untuk query subtree cepat. Hanya `type = PT` yang **wajib lapor** dan punya Admin PT.
- `Division` — `entity_id` (PT), `division_type_id` (ref daftar induk grup), `name`, `is_active`.
- `Project` — `entity_id` (PT), `code`, `name`, `phase` enum {`INISIASI`,`PERENCANAAN`,`PELAKSANAAN`,`PENYELESAIAN`}, `lifecycle` enum {`DIUSULKAN`,`AKTIF`,`DITUTUP`,`DIARSIPKAN`}, `pic_user_id`, `start_date`, `target_end_date`, `approved_by`, `approved_at`, `closing_evidence_id`.
- `AdminAppointment` — `entity_id`, `user_id`, `kind` {`UTAMA`,`PENGGANTI`}, `sk_number`, `valid_from`, `valid_until`, `status`, riwayat evaluasi.

**Daftar induk grup** (dikelola `DIREKTUR_SDM_GA`)
- `DivisionType`, `AspectCategory` (Operasional, Keuangan, Kepatuhan, SDM, HSE, Proyek, Sistem, Komersial), `Priority` (Tinggi/Sedang/Rendah), `WorkCalendar` + `Holiday` (tanggal, nama, scope: grup atau entitas tertentu).

**Pengguna & akses**
- `User` — email unik, name, phone, `is_active`, `totp_secret` (terenkripsi), `last_login_at`.
- `RoleAssignment` — `user_id`, `role` enum, `entity_id` (nullable untuk `TI`), `division_id?`, `project_id?`, `valid_from`, `valid_until`.
- `Delegation` — `from_user_id`, `to_user_id`, `role_assignment_id`, `starts_at`, `ends_at`, `reason`, `status`.

**Pelaporan harian — Modul Proyek**
- `DailyProjectReport` — `project_id`, `entity_id`, `report_date` (DATE, unik bersama `project_id`), `status` enum {`SELESAI`,`ON_PROGRESS`,`TERKENDALA`,`MENUNGGU_KEPUTUSAN`,`TIDAK_ADA_PERUBAHAN`}, `progress_pct` (0–100), `achievement_today` text, `obstacle` text?, `follow_up` text?, `follow_up_target_date` date?, `decision_requested_from` text?, `needs_escalation` bool, `is_locked`, `locked_at`, `is_late`, `submitted_at`, `submitted_by`.

**Pelaporan mingguan — Modul Divisi**
- `WeeklyDivisionReport` — `division_id`, `entity_id`, `iso_year`, `iso_week`, `period_start`, `period_end`, `status_header` {`DRAFT`,`MENUNGGU_PERSETUJUAN`,`DISETUJUI`,`TERKUNCI`}, `approved_by`, `approved_at`, `is_locked`, `locked_at`, `is_late`.
- `WeeklyReportItem` — `weekly_report_id`, `aspect_category_id`, `work_item` (satu baris = satu deliverable), `target_output`, `pic_name`, `pic_title`, `target_date`, `status` enum {`SELESAI`,`ON_PROGRESS`,`BELUM_MULAI`,`TERKENDALA`,`NA`}, `progress_pct`, `achievement_this_week`, `obstacle_follow_up`?, `priority_id`, `needs_escalation`, `carried_over_from_item_id?` (untuk carry-over minggu sebelumnya).

**Bukti, catatan, eskalasi**
- `Evidence` — polymorphic (`target_type`, `target_id`), `storage_key`, `file_name`, `mime`, `size`, `sha256`, `uploaded_by`, atau `url` bila berupa tautan.
- `Note` — catatan Direktur pada report/item/entitas, `visibility` {`INTERNAL_ENTITAS`,`HOLDING`}.
- `Escalation` — `source_type`/`source_id` (daily report / weekly item), `entity_id`, `raised_by`, `raised_at`, `summary`, `needed` {`KEPUTUSAN`,`ANGGARAN`,`DUKUNGAN_LINTAS_FUNGSI`}, `status` {`DIAJUKAN`,`DITINJAU`,`DIPUTUSKAN`,`DITUTUP`}, `decided_by`, `decided_at`, `decision_text`, `sla_days` (default 7).

**Pengendalian**
- `UnlockRequest` — `target_type`/`target_id`, `requested_by`, `reason`, `status` {`DIAJUKAN`,`DISETUJUI`,`DITOLAK`,`DIEKSEKUSI`}, `approved_by`, `executed_by`, jendela waktu buka (`unlock_until`), `re_locked_at`.
- `AuditLog` — append-only: `actor_id`, `action`, `target_type`, `target_id`, `before` (jsonb), `after` (jsonb), `ip`, `user_agent`, `at`. Trigger DB atau middleware Prisma; **tidak ada endpoint delete/update** untuk tabel ini.
- `LateIncident` — `entity_id`, `cycle` {`HARIAN`,`MINGGUAN`}, `period`, `occurrence_in_month` (1,2,3+), `action_taken`.
- `SpotCheck` (uji petik) — `entity_id`, `month`, daftar item Selesai yang terpilih acak (min 5), `checked_by`, `result` per item {`SESUAI`,`TIDAK_SESUAI`}, catatan.
- `NotificationLog` — `channel`, `recipient`, `template`, `payload`, `status`, `sent_at`, `error`.
- `KpiSnapshot` — hasil hitung KPI per entitas per periode (materialized, dihitung job), agar dashboard 1.000 entitas tetap cepat.

---

## 4. Modul Proyek — Siklus Harian

**Alur:** PIC Proyek melapor ke Admin PT (di luar sistem) → Admin PT membuka Modul Proyek → memilih proyek dari daftar aktif entitasnya → mengisi formulir → sistem validasi → simpan → pukul **17.00 WIB** sistem mengunci → **17.15** kirim pengingat ke Admin PT & Direktur Entitas untuk proyek yang belum diperbarui → pagi berikutnya Direktur meninjau ringkasan.

**Formulir harian (field wajib ditandai W, W* = wajib bersyarat):**
- Tanggal laporan (W, otomatis = hari ini WIB, tidak bisa diubah)
- Entitas (W, terkunci mengikuti assignment Admin PT yang login)
- Nama proyek (W, pilih dari daftar proyek `AKTIF` entitas — tidak boleh ketik bebas)
- Tahap proyek (W)
- Status hari ini (W)
- Persentase kemajuan (W, 0–100; tidak boleh turun dari hari sebelumnya kecuali ada alasan yang diisi)
- Capaian hari ini (W, teks hasil — tampilkan hint: "tulis hasil, bukan aktivitas")
- Kendala (W* bila Terkendala / Menunggu Keputusan)
- Tindak lanjut & target tanggal (W* bila Terkendala / Menunggu Keputusan)
- Pihak yang dimintai keputusan (W* bila Menunggu Keputusan)
- Bukti pendukung (W* bila Selesai; minimal 1 file gambar/PDF atau tautan)
- Perlu eskalasi (W, Ya/Tidak; bila Ya → otomatis membuat draft `Escalation`)

**Fitur khusus:**
- Tombol **"Tidak Ada Perubahan"** satu klik per proyek: membuat laporan dengan status `TIDAK_ADA_PERUBAHAN`, menyalin progress & tahap dari laporan terakhir, tanpa mengisi ulang field lain.
- Tampilan **daftar proyek hari ini** untuk Admin PT: setiap proyek aktif dengan badge "Sudah / Belum diperbarui", sisa waktu sampai 17.00, dan pintasan aksi.
- **Timeline proyek**: riwayat harian per proyek (progress chart + daftar status), termasuk penanda entri terlambat dan perubahan hasil buka kunci.
- Entri setelah 17.00 tetap boleh disimpan untuk hari itu **sampai 23.59** namun ditandai `is_late = true` dan menambah `LateIncident`. Setelah itu, tanggal tersebut hanya bisa diisi lewat buka kunci.

---

## 5. Modul Divisi — Siklus Mingguan

**Alur:** Kepala Divisi menyusun capaian mingguan → Admin PT membuka Modul Divisi Jumat pagi → memilih divisi → mengisi item → mengunggah bukti → mengirim ke Kepala Divisi (`MENUNGGU_PERSETUJUAN`) → Kepala Divisi menyetujui secara elektronik (bisa mengembalikan dengan catatan) → Jumat **16.00 WIB** sistem mengunci → **16.15** pengingat ke divisi yang belum melapor / belum disetujui → Senin Direktur SDM&GA meninjau, membuat catatan & daftar eskalasi, dan mengirim laporan ke Manajemen.

**Header laporan:** periode minggu (W, otomatis: ISO week + rentang tanggal), entitas (W, terkunci), divisi (W, pilih dari daftar divisi entitas).

**Item (satu baris = satu deliverable):** kategori aspek (W), item kerja (W), sasaran/output (W), PIC nama + jabatan (W), target selesai (W, tanggal), status (W), persentase (W), capaian minggu ini (W), kendala & tindak lanjut (W* bila Terkendala), bukti (W* bila Selesai), prioritas (W), perlu eskalasi (W).

**Fitur khusus:**
- **Carry-over otomatis**: saat membuat laporan minggu baru, semua item minggu sebelumnya yang statusnya bukan `SELESAI`/`NA` disalin sebagai draft dengan `carried_over_from_item_id`, dan ditampilkan penanda "minggu ke-n dibawa".
- **Persetujuan elektronik**: tombol "Setujui" oleh Kepala Divisi mencatat `approved_by`, `approved_at`, IP, dan hash isi laporan saat disetujui. Bila Admin PT mengubah item setelah disetujui (sebelum kunci), status kembali ke `MENUNGGU_PERSETUJUAN`.
- Laporan yang belum disetujui saat jam kunci tetap dikunci dan ditandai "Terkunci tanpa persetujuan" — tampil merah di dashboard.
- Divisi yang **tidak membuat laporan sama sekali** dalam minggu tersebut otomatis dicatat "belum melapor" dan entitasnya ditandai di dashboard (SOP 12.2).

---

## 6. Mesin Validasi

Implementasikan sebagai fungsi murni di `lib/validation` (diuji Vitest), dipanggil oleh Server Actions sebelum menyimpan. Sistem **menolak penyimpanan** bila:
1. Ada field wajib kosong.
2. Status `SELESAI` tanpa minimal 1 bukti.
3. Status `TERKENDALA` tanpa kendala + tindak lanjut + target tanggal.
4. Status `MENUNGGU_KEPUTUSAN` tanpa pihak yang dimintai keputusan.
5. Entitas / divisi / proyek tidak berasal dari daftar induk (validasi referensial + cek cakupan user).
6. Laporan sudah `is_locked` (kecuali dalam jendela `UnlockRequest` yang dieksekusi).
7. Pengguna tidak punya assignment `ADMIN_PT` yang valid untuk entitas tersebut pada tanggal tersebut.

Pesan error harus spesifik per field, dalam Bahasa Indonesia, dan ditampilkan inline di form.

---

## 7. Penguncian, Keterlambatan, Buka Kunci, Audit

**Penguncian otomatis** (job terjadwal, idempoten, WIB):
- Harian: setiap **hari kerja** pukul 17.00 → set `is_locked` untuk semua `DailyProjectReport` tanggal itu; proyek aktif tanpa laporan hari itu → dibuat record "tidak dilaporkan" (bukan laporan, tapi catatan ketiadaan) untuk KPI.
- Mingguan: setiap Jumat 16.00 → kunci semua `WeeklyDivisionReport` minggu berjalan; divisi tanpa laporan → tandai belum melapor.
- "Hari kerja" ditentukan oleh `WorkCalendar` + `Holiday` (grup dan per-entitas). Bila Jumat libur, batas mingguan bergeser ke hari kerja terakhir minggu itu pukul 16.00 (konfigurasi).
- Job harus menangani kegagalan sebagian dan bisa dijalankan ulang tanpa duplikasi.

**Keterlambatan bertingkat** (SOP 12.2), dihitung per entitas per bulan kalender:
- Terlambat ke-1: tandai entri, notifikasi ke Admin PT.
- Ke-2: notifikasi ke Admin PT + Direktur Entitas.
- Ke-3 atau lebih: masuk laporan kepatuhan bulanan + tandai "evaluasi penunjukan Admin PT".
- Tidak melapor sama sekali dalam satu minggu: entitas ditandai "belum melapor" di dashboard + item eskalasi ke Manajemen pada laporan mingguan.

**Alur buka kunci** (satu-satunya cara mengubah data terkunci):
1. Admin PT membuat `UnlockRequest` (target + alasan wajib).
2. `DIREKTUR_SDM_GA` menyetujui/menolak (dengan catatan).
3. `TI` mengeksekusi: membuka target selama jendela terbatas (default 24 jam), lalu otomatis terkunci kembali oleh job.
4. Setiap perubahan dalam jendela tersebut tercatat di `AuditLog` dengan referensi ke `UnlockRequest`, dan tampil sebagai penanda "diubah pasca-kunci" di semua tampilan.

**Audit trail**: seluruh create/update pada tabel pelaporan, evidence, escalation, assignment, delegation, unlock, dan login. Halaman audit dapat difilter per aktor/target/rentang tanggal; hanya `AUDITOR`, `DIREKTUR_SDM_GA`, `TI` (metadata saja) yang bisa membuka.

---

## 8. Notifikasi & Pengingat

Semua melalui `NotificationService.send(template, recipients, payload)`; kanal Email + WhatsApp (adapter), dengan preferensi kanal per user. Template minimal:
- `DAILY_REMINDER_1715` — ke Admin PT + Direktur Entitas: daftar proyek belum diperbarui hari ini.
- `WEEKLY_REMINDER_FRI_1615` — ke Admin PT + Kepala Divisi + Direktur Entitas: divisi belum melapor / belum disetujui.
- `APPROVAL_REQUESTED` — ke Kepala Divisi saat Admin PT mengirim laporan mingguan.
- `LATE_INCIDENT_n` — sesuai tingkat keterlambatan.
- `ESCALATION_RAISED` / `ESCALATION_DECIDED` — ke Direktur SDM&GA / Manajemen / pengaju.
- `UNLOCK_REQUESTED` / `UNLOCK_APPROVED` / `UNLOCK_EXECUTED`.
- `PROJECT_PROPOSED` — ke Direktur Entitas untuk persetujuan proyek baru.
- Ringkasan harian (pagi) dan mingguan (Senin) ke Direktur — berisi tautan langsung ke dashboard.
Semua pengiriman dicatat di `NotificationLog`; ada halaman admin untuk melihat gagal kirim dan mengirim ulang.

---

## 9. Dashboard & Eskalasi

Prinsip: **exception-based** — untuk 1.000 entitas, yang muncul di atas adalah masalah, bukan semua data. Semua angka dashboard dibaca dari `KpiSnapshot` + agregat ringan; pembaruan snapshot dijalankan setelah jam kunci dan setiap 15 menit di jam kerja (incremental).

**Dashboard Manajemen / Owner (root):**
- Kartu ringkas: entitas wajib lapor, entitas sudah/belum lapor hari ini, entitas belum lapor minggu ini, eskalasi menunggu keputusan (dengan umur hari), item prioritas tinggi terkendala.
- **Peta kepatuhan** berbentuk treemap/heatmap mengikuti hierarki (sub-holding → sektor → wilayah → PT), warna berdasarkan skor kepatuhan; klik untuk drill-down.
- Daftar "perlu perhatian": entitas terlambat ≥3× bulan ini, eskalasi > 7 hari, proyek tanpa perubahan > N hari berturut-turut (N konfigurasi, default 10).
- Papan eskalasi untuk memutuskan langsung dari dashboard.

**Dashboard Direktur SDM&GA (root):** semua di atas + ringkasan harian ringkas (per PT: proyek diperbarui/terkendala/menunggu keputusan) + tampilan mingguan penuh per divisi + editor catatan & daftar eskalasi + tombol "Susun laporan ke Manajemen" (bagian 10).

**Dashboard Direktur Entitas (cakupannya):** sama, dibatasi subtree; fokus ke proyek Terkendala dan divisi belum disetujui.

**Tampilan Admin PT:** bukan dashboard, melainkan "meja kerja hari ini": proyek belum diperbarui, laporan mingguan status draft/menunggu persetujuan, sisa waktu, permohonan buka kunci.

**Papan eskalasi:** kolom Diajukan → Ditinjau → Diputuskan → Ditutup, filter entitas/jenis/umur, SLA 7 hari dengan penanda merah bila lewat. Keputusan Manajemen dicatat sebagai teks + tanggal dan otomatis dikirim ke pengaju.

Semua tampilan hierarki harus memakai filter subtree berbasis `Entity.path` (LIKE prefix) dan pagination server-side. Target: halaman dashboard root memuat < 2 detik dengan 1.000 PT × 10 proyek × 30 hari data.

---

## 10. Laporan, KPI, Uji Petik

**KPI kepatuhan** (dihitung job ke `KpiSnapshot`, per entitas & agregat subtree):

| Indikator | Formula | Target | Periode |
|---|---|---|---|
| Ketepatan waktu input harian | entri tepat waktu ÷ (proyek aktif × hari kerja) | ≥ 95% | Bulanan / entitas |
| Kelengkapan pelaporan divisi | divisi melapor & disetujui ÷ total divisi aktif | 100% | Mingguan / entitas |
| Kelengkapan bukti | item Selesai berbukti ÷ total item Selesai | 100% | Bulanan / entitas |
| Penyelesaian item prioritas tinggi | item prioritas tinggi Selesai ÷ total prioritas tinggi | ≥ 85% | Bulanan / grup |
| Waktu penyelesaian eskalasi | rata-rata hari dari diajukan → diputuskan | ≤ 7 hari | Bulanan / grup |

Tampilkan tren 6 bulan terakhir per indikator dan peringkat entitas (terbaik/terburuk).

**Laporan yang dapat diunduh** (PDF & XLSX, dihasilkan server dari data yang sama dengan dashboard, tanpa pengolahan ulang):
- Ringkasan harian (per entitas / subtree / grup).
- Laporan mingguan ke Manajemen (otomatis tersusun: kepatuhan, ringkasan divisi, daftar eskalasi, catatan Direktur SDM&GA).
- Laporan kepatuhan bulanan (KPI + daftar keterlambatan + entitas evaluasi Admin PT).
- Ekspor detail (XLSX) sesuai cakupan peran; Admin PT hanya entitasnya.

**Uji petik bulanan:** tombol "Buat uji petik bulan ini" memilih acak minimal 5 item `SELESAI` per entitas (seed tercatat agar dapat direproduksi), petugas membuka bukti dan menandai Sesuai/Tidak Sesuai; hasilnya masuk laporan kepatuhan.

---

## 11. Master Data, Onboarding, Administrasi

- CRUD pohon entitas (drag untuk memindahkan simpul, dengan konfirmasi dan audit), divisi per PT, proyek (usulan → persetujuan Direktur Entitas → aktif → ditutup dengan bukti → arsip).
- Daftar induk grup: tipe divisi, kategori aspek, prioritas, kalender kerja & hari libur (grup dan per-entitas).
- Penunjukan Admin PT utama & pengganti dengan nomor SK dan masa berlaku; peringatan 14 hari sebelum kedaluwarsa.
- Manajemen user, assignment, delegasi; pencarian user lintas entitas untuk peran Holding.
- **Impor massal** (XLSX/CSV) untuk entitas, divisi, proyek, user+assignment: unduh template → unggah → **dry-run** menampilkan tabel error per baris → konfirmasi → commit dalam transaksi. Batas 10.000 baris per berkas.
- Pengaturan sistem: jam kunci, jendela toleransi terlambat, SLA eskalasi, N hari tanpa perubahan, kanal notifikasi default, retensi bukti.
- Halaman status job (terakhir dijalankan, hasil, tombol jalankan ulang untuk `TI`).

---

## 12. Fase Pengerjaan

**Fase 0 — Fondasi**: setup repo, Prisma schema lengkap (bagian 3), migrasi awal, auth (OTP + password + TOTP), helper RBAC `can()` + middleware, `AuditLog` otomatis, layout dasar, seed: 1 holding, 2 sub-holding, 6 PT, ~20 divisi, ~30 proyek, user untuk setiap peran. Test: RBAC (termasuk aturan pemisahan input–setuju), subtree query.

**Fase 1 — Master Data & Administrasi** (bagian 11): pohon entitas, daftar induk, proyek lifecycle, penunjukan Admin PT, user/assignment/delegasi, kalender kerja, impor massal dengan dry-run.

**Fase 2 — Modul Proyek harian** (bagian 4 + 6): form, validasi, bukti (presigned upload), tombol Tidak Ada Perubahan, daftar proyek hari ini, timeline. Test: mesin validasi (semua 7 aturan).

**Fase 3 — Penguncian & keterlambatan** (bagian 7): job scheduler, kunci 17.00, entri terlambat, `LateIncident` bertingkat, alur buka kunci 3 langkah, halaman audit. Test: job idempoten, pergeseran hari libur.

**Fase 4 — Modul Divisi mingguan** (bagian 5): header + item, carry-over, persetujuan elektronik Kepala Divisi, kunci Jumat 16.00.

**Fase 5 — Notifikasi** (bagian 8): service, adapter email + WhatsApp (mock di dev), template, log & kirim ulang.

**Fase 6 — Dashboard & Eskalasi** (bagian 9): `KpiSnapshot` job, dashboard per peran, peta kepatuhan drill-down, papan eskalasi, meja kerja Admin PT.

**Fase 7 — Laporan, KPI, Uji Petik** (bagian 10): perhitungan KPI, tren, PDF/XLSX, laporan mingguan ke Manajemen, uji petik.

**Fase 8 — Pengerasan**: Playwright E2E (input harian → kunci → buka kunci; mingguan → setujui → kunci; eskalasi → keputusan), rate limiting, header keamanan, uji beban dashboard dengan seed 1.000 PT, dokumentasi deploy (Docker Compose: app, postgres, redis/pg-boss worker, minio) dan runbook backup/restore.

---

## 13. Kriteria Penerimaan Global

- Tidak ada jalur untuk mengubah data terkunci selain alur buka kunci; dibuktikan dengan test.
- Admin PT tidak bisa melihat/menyentuh entitas lain, termasuk lewat manipulasi ID di URL/API (test IDOR).
- Semua batas waktu benar di WIB dan menghormati kalender kerja, termasuk bila hari kunci jatuh pada libur.
- Dashboard root < 2 detik dengan data seed skala 1.000 PT.
- Semua pesan UI Bahasa Indonesia; form dapat dipakai di layar 360px.
- Setiap Server Action memeriksa `can()`; setiap perubahan data pelaporan meninggalkan jejak di `AuditLog`.
- Skema Zod dan enum Prisma sinkron (satu sumber, di-generate atau diuji kesesuaiannya).

Mulai dari **Fase 0**. Sebelum menulis kode, tampilkan ringkasan skema Prisma dan struktur folder yang akan Anda buat untuk saya konfirmasi.
