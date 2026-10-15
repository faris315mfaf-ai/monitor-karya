# SH-SV1 — Server laporan subholding (16 Okt 2026)

Sumber kebenaran: `docs/zcode/KONTRAK-SUBHOLDING-16-OKT.md`. Dokumen ini mencatat bentuk
respons FINAL yang dibangun, untuk agen UI.

## Berkas

| Berkas | Isi |
|---|---|
| `src/lib/rbac.ts` | Peran `ADMIN_SUBHOLDING`, `SUPERVISOR`, `KETUA_UMUM`; kapabilitas `shreport:write/review/view-approved`; `ROLE_TABS` baru (MANAJEMEN → `['sh-overview']`, entri compact MANAJEMEN dihapus); `SUBHOLDING_ONLY_ROLES` + `isSubholdingOnlyRole`; `ENTITY_ROLES` + ADMIN_SUBHOLDING; `HOLDING_ROLES` + SUPERVISOR, KETUA_UMUM |
| `src/lib/constants.ts` | `ROLE_LABELS`/`ROLE_DESCRIPTIONS` peran baru; `HOLDING_POSITION_OPTIONS` + Supervisor, Ketua Umum; `NAV_TABS` + `sh-dashboard`, `sh-inbox`, `sh-history`, `sh-review`, `sh-overview`; template notifikasi `SH_*` |
| `src/lib/auth.ts` | `requireApiUser` menolak 403 peran subholding kecuali `{ allowSubholdingRoles: true }`; `scopeEntityIds` → `[]`, `refuseUnscoped` → 403, `resolveScopeEntityId` → entitas kosong untuk peran itu |
| `src/lib/subholding/rules.ts` | Aturan murni (boleh diimpor UI): status, label, `SH_LIMITS`, `reporterTitle`, `adminCanEdit/Withdraw`, validasi isian/keputusan/komentar |
| `src/lib/subholding/{scope,access,report,notify,reminders,evidence,inbox,badges,http}.ts` | Cakupan (PT keturunan subholding via `path`), bentuk `ShReport`, notifikasi, audit, pengingat, kunci bukti |
| `src/app/api/sh/**` | Rute di bawah |
| `src/lib/evidence-access.ts`, `src/app/api/evidence/**` | targetType `SUBHOLDING_REPORT` |
| `src/app/api/{profile,profile/password,notifications,nav-badges}/route.ts` | Ikut serta `allowSubholdingRoles` (profil, ganti sandi, notifikasi SENDIRI, badge sh) |
| `tests/api/sh-laporan.test.ts` | 33 tes; `tests/api/admin-fake-db.ts` diperluas (relasi per model, kolom JSON) |
| `tests/api/keamanan-galat-mentah.test.ts` | Rute admin subholding dipanggil sebagai ADMIN_SUBHOLDING |

## Peran baru di rute lama

Gagal-tertutup: `requireApiUser()` tanpa opsi → **403** `{ error: 'Fitur ini tidak tersedia untuk peran Anda.' }`
untuk ADMIN_SUBHOLDING/SUPERVISOR/KETUA_UMUM. Rute yang boleh dipakai UI peran ini:
`/api/auth/me`, `/api/auth/logout`, `/api/profile` (GET/PATCH), `/api/profile/password`,
`/api/notifications` (GET/PATCH, milik sendiri), `/api/nav-badges`, `/api/evidence/**`, `/api/sh/**`.
MANAJEMEN tetap peran global lama (kapabilitas lama dipertahankan); hanya tab-nya diganti.

`GET /api/nav-badges` untuk peran subholding → `{ badges: { 'sh-inbox': n } }` (admin, pesan
belum dibaca) atau `{ badges: { 'sh-review': n } }` (supervisor, laporan MENUNGGU); 0 tidak dikirim.

## Bentuk `ShReport`

```ts
{
  id, subholdingId, subholdingName, ptId, ptName,
  reportDate: 'YYYY-MM-DD',            // hari WIB
  kegiatan, deskripsi, reporterName,
  reporterTitleKind: 'MANAJER' | 'KEPALA', reporterTitleField,
  reporterTitle: 'Manajer Proyek',
  status: 'MENUNGGU' | 'PERLU_PERBAIKAN' | 'DISETUJUI',
  submittedAt: ISO, decidedAt: ISO | null, decidedByName: string | null,
  evidenceCount, evidence: [{ id, fileName, mime, size, url }],   // url: tautan (http/https) atau null untuk berkas → buka lewat GET /api/evidence/:id
  comments: [{ id, kind: 'KOMENTAR'|'PERBAIKAN'|'SETUJU'|'BALASAN', body, authorName, authorRole, createdAt: ISO, mine }],  // urut lama→baru
  canEdit, canWithdraw                  // admin pemilik: MENUNGGU/PERLU_PERBAIKAN · MENUNGGU; Super Admin: selalu true
}
```

Galat selalu `{ error }` (422 validasi bisa juga `{ error, field }`).

## Rute

| Rute | Peran | Respons |
|---|---|---|
| `GET /api/sh/options` | ADMIN_SUBHOLDING | `{ subholding: { id, name }, pts: [{ id, code, name }], reporters: [{ name, titleKind, titleField }] }` — PT aktif keturunan subholding (urut nama); ≤8 pelapor unik terbaru |
| `GET /api/sh/reports?from&to&ptId&status&q&page&pageSize` | ADMIN_SUBHOLDING | `{ items: ShReport[], total, page, pageSize, counts: { MENUNGGU, PERLU_PERBAIKAN, DISETUJUI } }`. Bawaan `from = to = hari ini`; `to` bawaan = `from`; rentang ≤366 hari; pageSize bawaan 50 (maks 200); `q` cari di kegiatan/deskripsi/nama pelapor; `counts` = saringan sama tanpa status. Urut tanggal lalu kirim terbaru. 422 tanggal/status tidak sah |
| `POST /api/sh/reports` | ADMIN_SUBHOLDING | body `{ kegiatan≤200, deskripsi≤4000, ptId, reporterName≤120, reporterTitleKind, reporterTitleField≤80 }` → **201** `{ report }`. 422 isian / PT di luar subholding. Header `Idempotency-Key` (8–64 char) → ulangan dibalas respons pertama (+ header `Idempotency-Replayed: true`). Notifikasi `SH_LAPORAN_BARU` ke semua Supervisor |
| `GET /api/sh/reports/:id` | admin pemilik · Supervisor/Super Admin · Ketum/Manajemen hanya DISETUJUI | `{ report }`; di luar cakupan = 404 |
| `PATCH /api/sh/reports/:id` | admin pemilik (MENUNGGU/PERLU_PERBAIKAN) · Super Admin (apa pun, status tetap) | body isian 1–5 (boleh sebagian) → `{ report }`. PERLU_PERBAIKAN → MENUNGGU (`submittedAt` baru, `decidedAt/decidedByName` kosong, notifikasi `SH_LAPORAN_KIRIM_ULANG` ke Supervisor). 409 bila DISETUJUI / kalah balapan dengan keputusan; 404 laporan subholding lain; 403 Supervisor/Ketum |
| `DELETE /api/sh/reports/:id` | admin pemilik (hanya MENUNGGU) · Super Admin | `{ ok: true }`; komentar + baris bukti ikut terhapus, berkas storage dibuang setelah commit. 409 bila bukan MENUNGGU |
| `POST /api/sh/reports/:id/comments` | admin pemilik → BALASAN · Supervisor/Super Admin → KOMENTAR | body `{ body ≤2000 }` → **201** `{ comment: ShComment, report: ShReport }`. Status apa pun. Ketum/Manajemen 403 |
| `POST /api/sh/reports/:id/decision` | Supervisor, Super Admin | `{ action: 'approve' \| 'revise', note? }` → `{ report }`. revise: note ≥5 huruf (422), jadi komentar PERBAIKAN; approve: note opsional (komentar SETUJU), **409 bila 0 bukti**. 409 bila status bukan MENUNGGU / dua klik bersamaan. Notifikasi `SH_KEPUTUSAN` ke admin subholding |
| `GET /api/sh/inbox` | ADMIN_SUBHOLDING | `{ items: [{ id, kind, body, createdAt, unread, authorName, report: { id, kegiatan, ptName, status, reporterName, reporterTitle, submittedAt, evidenceCount } }], reminders: [{ id, text, createdAt }], unreadCount }` — 100 pesan peninjau terbaru (KOMENTAR/PERBAIKAN/SETUJU, bukan BALASAN sendiri); pengingat = PT aktif tanpa laporan pada hari kerja (Sen–Jum) sebelumnya, `id` stabil `pengingat-<ptId>-<YYYY-MM-DD>` |
| `POST /api/sh/inbox/read` | ADMIN_SUBHOLDING | `{ ids?: string[] (≤200), all?: true }` → `{ ok: true, marked }`; id subholding lain diabaikan; 422 bila kosong |
| `GET /api/sh/review?status&subholdingId&date` | Supervisor, Super Admin | `{ items: ShReport[], counts, subholdings: [{ id, name, waiting }] }`. Bawaan status MENUNGGU, tanpa `date` = semua tanggal; MENUNGGU urut terlama dulu, lainnya keputusan terbaru; ≤200 butir. `counts` = saringan subholding+tanggal; `waiting` = MENUNGGU per subholding (saringan tanggal) |
| `GET /api/sh/overview?date` | Ketum, Manajemen, Supervisor, Super Admin | `{ date, subholdings: [{ id, name, count, ptCount, pts: [{ id, name, reports: [{ id, kegiatan, deskripsi, evidence: [{ id, fileName, mime }] }] }] }] }` — HANYA DISETUJUI pada tanggal itu (bawaan hari ini); semua subholding aktif tampil walau 0; `ptCount` = PT aktif di subholding; `pts` hanya PT yang punya laporan (urut nama) |

## Bukti (`targetType: 'SUBHOLDING_REPORT'`, `targetId` = id laporan)

- Unggah `POST /api/evidence/upload` (multipart `file`, `targetType`, `targetId`, `label?`) atau tautan
  `POST /api/evidence` `{ targetType, targetId, fileName, url }` → `{ ok, evidence, evidenceCount }`.
- Tulis/hapus: admin subholding pemilik saat MENUNGGU/PERLU_PERBAIKAN (409 bila DISETUJUI), Super Admin
  kapan pun. Supervisor/Ketum/Manajemen/TI 403. Status diperiksa ulang di dalam transaksi dengan baris
  laporan dikunci (`FOR UPDATE`) — hapus bukti tidak bisa menyalip persetujuan.
- Baca `GET /api/evidence/:id` (`{ url, kind: 'file'|'link', expiresInSeconds? }`) dan
  `GET /api/evidence?targetType&targetId`: admin pemilik, Supervisor & Super Admin semua; Ketum &
  Manajemen hanya laporan DISETUJUI; TI/Auditor/peran lama 403.
- `DELETE /api/evidence/:id` untuk bukti subholding: baris dihapus dulu, berkas storage setelah commit.

## AuditLog (`targetType: 'SUBHOLDING_REPORT'`)

`CREATE_SH_REPORT`, `UPDATE_SH_REPORT`, `RESUBMIT_SH_REPORT`, `WITHDRAW_SH_REPORT`,
`APPROVE_SH_REPORT`, `REVISE_SH_REPORT`, `COMMENT_SH_REPORT` (+ `ATTACH/UPLOAD/REMOVE_EVIDENCE` yang sudah ada).
Label ramah untuk aksi baru belum ditambahkan ke `src/lib/audit-labels.ts`.

## Notifikasi (NotificationLog APLIKASI, payload `{ title, body, tab, reportId }`)

| Template | Penerima | tab |
|---|---|---|
| `SH_LAPORAN_BARU` | semua Supervisor aktif | `sh-review` |
| `SH_LAPORAN_KIRIM_ULANG` | semua Supervisor aktif | `sh-review` |
| `SH_KEPUTUSAN` | Admin subholding laporan | `sh-inbox` |
| `SH_KOMENTAR` | admin (komentar supervisor) / Supervisor lain (balasan admin) | `sh-inbox` / `sh-review` |

## Gerbang

- `npx eslint src` bersih. `npx vitest run`: semua lulus kecuali dua tes plafon login yang
  kehabisan waktu 5 detik saat mesin sibuk (lulus bila dijalankan sendiri).
- `npx tsc`: semua berkas SV1 bersih. Galat yang tersisa ada di `src/app/api/companies/route.ts`
  (`MOVABLE_ENTITY_TYPES`, `patchWithMove`), pekerjaan SV2 yang masih berjalan.

## Catatan untuk agen lain

- **SV2**: `ENTITY_ROLES` kini memuat ADMIN_SUBHOLDING dan `HOLDING_ROLES` memuat SUPERVISOR dan
  KETUA_UMUM, jadi `ALL_ROLES`/`manageableRoles` Super Admin ikut. Pembatasan "ADMIN_SUBHOLDING
  hanya di entitas SUB_HOLDING" perlu dijaga di `companies.ts`.
- **UI**: TAB_ICONS di `shell.tsx` sudah memuat tab sh-*. Untuk peran subholding, panggil hanya rute
  yang tercantum di atas; rute lama menjawab 403.
- Keputusan terbuka: kapabilitas lama MANAJEMEN (eskalasi, persetujuan proyek, baca grup) dibiarkan.
