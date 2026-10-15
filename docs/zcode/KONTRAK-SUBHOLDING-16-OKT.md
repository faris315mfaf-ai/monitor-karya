# Kontrak model laporan SUBHOLDING — 16 Oktober 2026

Sumber kebenaran untuk semua agen. Mockup yang disetujui pemilik:
https://claude.ai/artifact/2vej4mKj3RD8v5QcFGXU9e (papan 1–10). Bila kode lama bertentangan,
dokumen ini yang berlaku. Basis kode: commit `b63bd30` (produksi). Pekerjaan peran 15 Okt
DIARSIPKAN di branch `arsip/k15-peran` — JANGAN dipakai/diporting.

## Model bisnis

- **PT BIKE Tbk = superholding** (Entity `HOLDING`). Di bawahnya **subholding** (Entity
  `SUB_HOLDING`), yang membawahi **PT** (Entity `PT` dengan `path` diawali path subholding;
  bisa lewat SECTOR/REGION).
- **Admin subholding** (`ADMIN_SUBHOLDING`, `scopeEntityId` = id subholding): SATU akun per
  subholding, DIPAKAI BERSAMA banyak pelapor. Menambah laporan berkali-kali.
- **Supervisor** (`SUPERVISOR`, direksi di luar subholding, `scopeEntityId` null): meninjau
  laporan SEMUA subholding — setujui, minta perbaikan (wajib komentar), atau komentar saja.
- **Ketua Umum** (`KETUA_UMUM`) dan **Manajemen** (`MANAJEMEN`): HANYA dashboard laporan
  yang sudah DISETUJUI, seluruh subholding.
- Akun **PIC_PROYEK** dan **KEPALA_DIVISI** dihapus (dinonaktifkan lewat skrip saat deploy;
  data lama tetap).
- Superadmin: menyiapkan subholding + PT + akun. Membuat subholding → otomatis akun Admin
  subholding `admin.<slug>`, sandi `12345678`, wajib ganti sandi saat masuk pertama.

## Isian laporan (semua wajib)
1. Kegiatan / proyek (≤200) 2. Deskripsi (≤4000) 3. PT pelaksana (dropdown: hanya PT di
subholding akun) 4. Nama pelapor (≤120) 5. Jabatan pelapor: `MANAJER` | `KEPALA` + bidang
(≤80) → tampil "Manajer Proyek" 6. Bukti: minimal 1 (foto/dokumen/tautan) —
Evidence `targetType: 'SUBHOLDING_REPORT'`, `targetId` = id laporan.

## Status
`MENUNGGU` → (`DISETUJUI` | `PERLU_PERBAIKAN`). PERLU_PERBAIKAN → admin ubah → kembali
`MENUNGGU`. Admin boleh ubah/tarik (hapus) saat `MENUNGGU`; ubah saat `PERLU_PERBAIKAN`.
`DISETUJUI` terkunci (tidak bisa diubah/dihapus siapa pun selain superadmin).
Setujui WAJIB punya ≥1 bukti (409 bila tidak). Komentar boleh kapan saja.

## Data (migrasi 0034_laporan_subholding — SUDAH ditulis; jangan ubah tanpa koordinasi)
`SubholdingReport` (subholdingId, ptId, reportDate = 00.00 WIB sebagai UTC, kegiatan,
deskripsi, reporterName, reporterTitleKind, reporterTitleField, status, createdById,
submittedAt, decidedById, decidedAt) dan `SubholdingReportComment` (reportId, authorId,
kind `KOMENTAR|PERBAIKAN|SETUJU|BALASAN`, body, readAt).

## Peran, tab, kapabilitas (src/lib/rbac.ts + src/lib/constants.ts)
| Peran | ROLE_TABS |
|---|---|
| ADMIN_SUBHOLDING | `sh-dashboard`, `sh-inbox`, `sh-history` |
| SUPERVISOR | `sh-review` |
| KETUA_UMUM | `sh-overview` |
| MANAJEMEN | `sh-overview` (menggantikan tab lamanya) |
| SUPERADMIN | tab lama tetap (Perusahaan & akun dipakai untuk subholding/PT/akun) |
NAV_TABS baru: `sh-dashboard` "Dashboard", `sh-inbox` "Kotak masuk", `sh-history`
"Riwayat", `sh-review` "Persetujuan", `sh-overview` "Dashboard".
Kapabilitas baru: `shreport:write` (ADMIN_SUBHOLDING), `shreport:review` (SUPERVISOR,
SUPERADMIN), `shreport:view-approved` (KETUA_UMUM, MANAJEMEN, SUPERVISOR, SUPERADMIN).
Label peran Indonesia: Admin subholding, Supervisor, Ketua Umum, Manajemen.

## API (semua JSON; galat `{ error }`; 401/403/404/409/422 seperti pola yang ada)

`ShReport` (bentuk baca):
```
{ id, subholdingId, subholdingName, ptId, ptName, reportDate: 'YYYY-MM-DD',
  kegiatan, deskripsi, reporterName, reporterTitleKind, reporterTitleField,
  reporterTitle: 'Manajer Proyek', status, submittedAt, decidedAt, decidedByName,
  evidenceCount, evidence: [{ id, fileName, mime, size, url }],
  comments: [{ id, kind, body, authorName, authorRole, createdAt, mine }],
  canEdit, canWithdraw }
```
- `GET /api/sh/options` (ADMIN_SUBHOLDING) → `{ subholding: { id, name }, pts: [{ id, code, name }], reporters: [{ name, titleKind, titleField }] }` (pelapor terakhir, unik, ≤8).
- `GET /api/sh/reports?from&to&ptId&status&q&page&pageSize` (ADMIN_SUBHOLDING, subholding sendiri; bawaan hari ini) → `{ items: ShReport[], total, counts: { MENUNGGU, PERLU_PERBAIKAN, DISETUJUI } }`.
- `POST /api/sh/reports` (ADMIN_SUBHOLDING) body isian 1–5 → `{ report }` (status MENUNGGU; reportDate hari ini WIB). Mendukung header `Idempotency-Key` (pola src/lib/idempotency.ts). Bukti diunggah sesudahnya lewat `POST /api/evidence/upload` (targetType SUBHOLDING_REPORT) atau `POST /api/evidence` (tautan).
- `PATCH /api/sh/reports/:id` (ADMIN_SUBHOLDING) isian 1–5 → MENUNGGU/PERLU_PERBAIKAN saja; PERLU_PERBAIKAN → MENUNGGU.
- `DELETE /api/sh/reports/:id` (ADMIN_SUBHOLDING) hanya MENUNGGU → hapus + bukti (berkas storage setelah commit).
- `POST /api/sh/reports/:id/comments` `{ body }` — admin (BALASAN) atau supervisor (KOMENTAR).
- `POST /api/sh/reports/:id/decision` (SUPERVISOR) `{ action: 'approve'|'revise', note? }` — revise wajib note ≥5 huruf (jadi komentar PERBAIKAN); approve: note opsional (komentar SETUJU), wajib ≥1 bukti; klaim bersyarat status MENUNGGU (selain itu 409).
- `GET /api/sh/inbox` (ADMIN_SUBHOLDING) → `{ items: [{ id, kind, body, createdAt, unread, authorName, report: { id, kegiatan, ptName, status, reporterName, reporterTitle, submittedAt, evidenceCount } }], reminders: [{ id, text, createdAt }], unreadCount }`; `POST /api/sh/inbox/read` `{ ids?: string[], all?: true }`. Pengingat: PT di subholding tanpa laporan pada hari kerja sebelumnya.
- `GET /api/sh/review?status=MENUNGGU|PERLU_PERBAIKAN|DISETUJUI&subholdingId&date` (SUPERVISOR/SUPERADMIN) → `{ items: ShReport[], counts, subholdings: [{ id, name, waiting }] }`.
- `GET /api/sh/overview?date=YYYY-MM-DD` (KETUA_UMUM/MANAJEMEN/SUPERVISOR/SUPERADMIN) → `{ date, subholdings: [{ id, name, count, ptCount, pts: [{ id, name, reports: [{ id, kegiatan, deskripsi, evidence: [{ id, fileName, mime }] }] }] }] }` — HANYA DISETUJUI pada `reportDate` itu; semua subholding aktif tampil walau 0.
- Bukti: `GET /api/evidence/:id` (URL bertanda tangan) harus mengizinkan: admin subholding laporannya; supervisor semua; KETUA_UMUM/MANAJEMEN hanya laporan DISETUJUI.
- `POST /api/companies` (SUPERADMIN) membuat Entity `SUB_HOLDING` → akun ADMIN_SUBHOLDING otomatis (`admin.<slug>`, `Admin <nama>`, sandi `12345678`, `mustChangePassword: true`, bentrok → akhiran angka); balasan `adminAccount: { id, username, defaultPassword }`. Superadmin bisa membuat akun SUPERVISOR / KETUA_UMUM / MANAJEMEN.

## UI (mockup) — Dock sederhana
- Admin: Dashboard (form Tambah laporan di atas + daftar laporan hari ini dengan saringan status, Perbaiki & kirim ulang, Tarik), Kotak masuk (daftar + percakapan + balas), Riwayat (tabel + saringan periode/PT/status/cari + CSV).
- Supervisor: Persetujuan (saring subholding, tab Menunggu/Diminta perbaikan/Disetujui, rincian + bukti + komentar + Setujui/Minta perbaikan/Komentar).
- Ketua Umum & Manajemen: Dashboard = HANYA kartu per subholding (pilih Hari ini/Kemarin); klik kartu → di bawahnya laporan per PT: judul + foto bukti di sampingnya; klik foto → membesar (sebelumnya/berikutnya); klik judul → pop-up judul + deskripsi. TANPA angka KPI.
- Semua responsif (ponsel: dock di bawah). Bahasa Indonesia, "Anda", tanpa emoji/tanda seru, status = warna + ikon + kata, konfirmasi hanya untuk hapus.
