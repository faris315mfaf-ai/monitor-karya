# Arsitektur

[← Indeks](README.md)

Monitor Karya adalah satu aplikasi Next.js 16 (App Router, React 19). Sasaran deploy-nya **VPS** (keputusan pemilik produk, 6 Okt 2026): kontainer Docker non-root dengan root filesystem read-only di belakang Caddy (HTTPS), lihat [`deploy/README.md`](../../deploy/README.md). Data disimpan di PostgreSQL (kini Supabase; paket `deploy/db-vps` menyiapkan VPS basis data lewat WireGuard) dan diakses lewat Prisma 6. Berkas bukti **tetap** di Supabase Storage. Autentikasi tidak memakai Supabase Auth: akun ada di tabel `User` (kata sandi scrypt), dan sesi berupa cookie bertanda HMAC. `vercel.json` masih ada dari masa Vercel, tetapi jadwal cron sekarang dipasang di crontab VPS.

![Arsitektur sistem](img/arsitektur.svg)

> Proyek ini memakai Next.js versi baru dengan perubahan besar: `middleware.ts` diganti `src/proxy.ts`. Baca panduan di `node_modules/next/dist/docs/` sebelum mengubah konvensi kerangka (lihat [`AGENTS.md`](../../AGENTS.md)).

## Struktur folder

```
prisma/
  schema.prisma          43 model; wilayah [P2-*], [F1-*], [F2-*] untuk model 6 Okt 2026
  migrations/0001..0025  SQL tangan; 0013–0025 (10 folder) belum diterapkan
src/
  proxy.ts               CSRF, batas badan, CSP bernonce, 404 /pratinjau di produksi
  app/
    page.tsx             "/" → AppShell (sesi wajib, force-dynamic)
    login/page.tsx       halaman masuk
    login/ganti-sandi/   wajib ganti kata sandi (mustChangePassword)
    pratinjau/page.tsx   pratinjau per peran (hanya dev)
    icon.svg             favikon
    api/**/route.ts      68 route
    globals.css          Tailwind 4 + token + @import ./css/*.css
    mk-modules.css       gaya modul (kerangka, Dock, meja kerja, perusahaan)
    css/                 laporan, weekly, pic, admin-sistem, proyek-divisi-eskalasi,
                         oversight, grup, utang-teknis, periksa-desain
  components/
    app-shell.tsx        memilih view menurut tab aktif
    app-provider.tsx     konteks sesi, tab aktif, branding
    shell.tsx, dock.tsx  kerangka navigasi (+ palet ⌘K dari search/)
    mk/                  komponen sistem desain (port TSX design-system/components)
    views/               satu berkas per tab
    work-desk/ pic/ kadiv/ admin/ oversight/ group/ companies/   bagian per peran/modul
    search/              palet ⌘K (command-palette.tsx)
    preview/             data contoh per area (mock-*.ts) + penimpa fetch untuk /pratinjau
    ui/                  sisa shadcn/Radix (sebagian besar tidak dipakai lagi)
  hooks/                 use-fetch, use-resource, use-toast
  lib/                   aturan bisnis bersama (lihat tabel di bawah)
design-system/           token (tokens.css), preset Tailwind, komponen acuan
deploy/                  VPS aplikasi (Docker, Caddy, cron.sh), VPS basis data, WireGuard
tests/                   vitest (lib/, api/): 39 berkas, 674 tes
```

## Alur sebuah permintaan

```mermaid
sequenceDiagram
    autonumber
    participant B as Peramban (view)
    participant P as src/proxy.ts
    participant R as route.ts
    participant A as lib/auth.ts
    participant L as lib/* (rbac, lock, ...)
    participant D as Prisma → Postgres
    B->>P: fetch('/api/…', { method, body })
    P->>P: Origin / Sec-Fetch-Site (mutasi), Content-Length ≤ 1 MB
    P->>R: diteruskan (+ header keamanan)
    R->>A: requireApiUser()
    A->>D: muat User dari cookie (cek sidik kata sandi, isActive)
    A-->>R: SessionUser | 401
    R->>L: can(role, kapabilitas), cakupan entitas/divisi/proyek, kunci WIB
    L-->>R: boleh / 403 / 409 / 422
    R->>D: baca / tulis (+ AuditLog untuk mutasi)
    R-->>B: JSON { … } atau { error }
```

Pola ini dipakai setiap route:

1. `requireApiUser()` ([`src/lib/auth.ts`](../../src/lib/auth.ts)) membaca cookie dan memuat ulang akun dari basis data pada setiap permintaan. Perubahan peran dan akses sementara berlaku seketika. Akun nonaktif dan token dengan sidik kata sandi lama ditolak.
2. Kapabilitas diperiksa dengan `can(role, 'x:y')` dari [`src/lib/rbac.ts`](../../src/lib/rbac.ts).
3. Cakupan data:
   - `scopeEntityIds(user)`: PT akun dan seluruh anaknya, lewat `Entity.path`. Peran grup mendapat `null` (seluruh grup).
   - `scopeUserIds(user)`: akun dalam cakupan itu.
   - Pembantu khusus: `guardProjectAccess` ([`pic-access.ts`](../../src/lib/pic-access.ts)), `canManageDivision` ([`kadiv.ts`](../../src/lib/kadiv.ts)), `canWriteEvidence` dan `canReadEvidence` ([`evidence-access.ts`](../../src/lib/evidence-access.ts)).
4. Aturan waktu dari [`src/lib/lock.ts`](../../src/lib/lock.ts).
5. Setiap mutasi penting menulis `AuditLog`. Notifikasi dalam aplikasi ditulis ke `NotificationLog` (`channel: 'APLIKASI'`).

Kode status yang dipakai konsisten:

| Kode | Arti |
| --- | --- |
| 400 | Badan tidak valid atau aksi tak dikenal |
| 401 | Tidak ada sesi |
| 403 | Bukan wewenang / di luar cakupan |
| 404 | Tidak ada, atau ada tetapi di luar cakupan |
| 409 | Konflik keadaan: terkunci, sudah diteruskan, pengingat kedua, dua klik bersamaan |
| 411, 413, 415 | Badan tanpa panjang, badan terlalu besar, jenis berkas tidak cocok |
| 422 | Validasi bisnis gagal; jawabannya membawa `errors: string[]` |
| 429 | Pembatas laju, dengan header `Retry-After` |
| 503 | Layanan belum disiapkan, misalnya Storage atau `CRON_SECRET` |

## Halaman dan view

Aplikasi berjalan di satu halaman. [`src/app/page.tsx`](../../src/app/page.tsx) membaca sesi di server (`force-dynamic`), memuat branding holding dan PT, lalu merender `AppShell`. Perpindahan tab tidak mengganti URL. Tab aktif disimpan di konteks [`app-provider.tsx`](../../src/components/app-provider.tsx), dan [`app-shell.tsx`](../../src/components/app-shell.tsx) memilih view:

| Tab (`NavTabId`) | View | Dokumen |
| --- | --- | --- |
| `dashboard` | `views/dashboard-view.tsx` → `role-dashboards.tsx` / `oversight-dashboard.tsx` | [ringkasan.md](ringkasan.md) |
| `companies` | `views/companies-view.tsx` | [perusahaan-akun.md](perusahaan-akun.md) |
| `work-desk` | `views/work-desk-view.tsx` → `work-desk/*` | [meja-kerja.md](meja-kerja.md) |
| `daily-input` | `views/daily-input-view.tsx` | [laporan-harian.md](laporan-harian.md) |
| `weekly-input` | `views/weekly-input-view.tsx` → `division-weekly-desk.tsx` | [capaian-mingguan.md](capaian-mingguan.md) |
| `inbox` | `views/inbox-view.tsx` | [penerimaan.md](penerimaan.md) |
| `projects` | `views/projects-view.tsx` | [proyek.md](proyek.md) |
| `divisions` | `views/divisions-view.tsx` | [divisi.md](divisi.md) |
| `approvals` | `oversight/approvals-view.tsx` | [peran-direktur-manajemen.md](peran-direktur-manajemen.md) |
| `escalations` | `views/escalations-view.tsx` | [eskalasi.md](eskalasi.md) |
| `entities` | `views/entities-view.tsx` | [entitas.md](entitas.md) |
| `audit` | `views/audit-view.tsx` | [log.md](log.md) |
| `system` | `views/system-view.tsx` | [sistem.md](sistem.md) |

View mengambil data dengan `useFetch` atau `useResource` ([`src/hooks/`](../../src/hooks/)). `useResource` memberi `reload()` untuk layar yang menulis lalu membaca ulang. Jawaban 401 langsung mengarahkan ke `/login`.

## RBAC: peran, kapabilitas, tab

Semua hak ada sebagai data di [`src/lib/rbac.ts`](../../src/lib/rbac.ts). Tabel yang sama mengatur navigasi di peramban dan pemeriksaan di API: UI menyembunyikan yang tidak boleh, API menolaknya.

| Kapabilitas | PIC | Kadiv | Admin PT | Direktur | SDM&GA | Manajemen | Auditor | TI | Super Admin |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `daily:input` | ● | | ● | | | | | ● | ● |
| `daily:forward` | | | ● | | | | | ● | ● |
| `weekly:input` | | ● | ● | | | | | ● | ● |
| `weekly:approve` | | ● | | | | | | ● | ● |
| `weekly:forward` | | | ● | | | | | ● | ● |
| `escalation:raise` | ● | ● | ● | ● | ● | | | ● | ● |
| `escalation:followup` | | | | ● | ● | ● | | ● | ● |
| `escalation:decide` | | | | | | ● | | ● | ● |
| `project:propose` | ● | | ● | ● | ● | ● | | ● | ● |
| `project:approve` | | | ● | ● | ● | ● | | ● | ● |
| `project:manage` | | | ● | | | | | ● | ● |
| `notify:remind` | | | ● | ● | ● | | | ● | ● |
| `unlock:request` | ●¹ | | ● | | | | | ● | ● |
| `unlock:approve` | | | | | ● | | | ● | ● |
| `unlock:execute` | | | | | | | | ● | ● |
| `users:manage` | | | | | | | | ● | ● |
| `companies:manage` | | | | | | | | | ● |
| `accounts:manage` | | | ● | | | | | | |
| `audit:read` | | | | ● | ● | ● | ● | ● | ● |
| `group:read` | | | | | ● | ● | ● | ● | ● |

¹ PIC hanya untuk laporan harian proyeknya sendiri (dicek di `POST /api/unlock-requests`, F1-A).

Beberapa hak tidak berupa kapabilitas, tetapi aturan di pustaka:

- Keputusan persetujuan materi/anggaran/cuti: `APPROVAL_DECIDER_ROLES` dan `canDecideApprovalIn` ([`oversight-shared.ts`](../../src/lib/oversight-shared.ts)). Direktur entitas untuk PT-nya; Manajemen, SDM & GA, TI, Super Admin seluruh grup.
- Membaca dan menanggapi laporan mingguan, tinjauan proyek: `READERS`, `isProjectOverseer` di modul yang sama.
- Pengajuan permintaan akses oleh Kepala divisi dan PIC: [`access-requesters.ts`](../../src/lib/access-requesters.ts).
- Peran hanya-baca (Auditor): `isReadOnlyRole` ([`group-panel.ts`](../../src/lib/group-panel.ts)).

Hal penting:

- **Peran grup** (`MANAJEMEN`, `AUDITOR`, `TI`, `SUPERADMIN`, `DIREKTUR_SDM_GA`) membaca seluruh grup. Peran lain terpaku pada `scopeEntityId`. Akun berlingkup tanpa PT ditolak (`refuseUnscoped`). Sejak penguatan keamanan, pemeriksaan ini gagal-tertutup.
- **Akun induk** (`TI`, `SUPERADMIN`, `isMasterRole`) boleh menulis di mana pun.
- **Tab per peran** ada di `ROLE_TABS`. Tab pertama menjadi tab pembuka; untuk semua peran itu Ringkasan. Urutan tampil mengikuti `NAV_TABS` di [`src/lib/constants.ts`](../../src/lib/constants.ts). Tab `approvals` (Persetujuan) dimiliki Direktur entitas dan Manajemen. `ROLE_COMPACT_TABS` menetapkan tab utama tablet/ponsel untuk Direktur (Ringkasan · Proyek · Eskalasi · Divisi) dan Manajemen (Ringkasan · Proyek · Persetujuan · Divisi).
- **Rantai persetujuan proyek** ada di `PROJECT_APPROVAL_CHAIN`, lihat [proyek.md](proyek.md).

![Peta navigasi per peran](img/navigasi-peran.svg)

## Waktu, tenggat, dan kunci (WIB)

Semua tenggat dihitung di [`src/lib/lock.ts`](../../src/lib/lock.ts) dalam WIB (UTC+7). Stempel waktu disimpan dalam UTC. Kunci **diturunkan dari jam**, tidak dipasang oleh cron, sehingga cron yang terlewat tidak pernah membuat laporan tetap terbuka.

| Aturan | Fungsi | Bawaan | Variabel env |
| --- | --- | --- | --- |
| Hari laporan = tengah malam WIB | `startOfWibDay`, `wibDateKey` | — | — |
| Hari kerja = Senin–Jumat WIB | `isWorkingDay` | — | — |
| Laporan harian hari D terkunci | `dailyLockAt`, `isDailyLocked` | D pukul 17.00 WIB | `DAILY_CUTOFF_HOUR` |
| Serah capaian mingguan | `weeklyDeadlines().handoverBy` | Kamis 17.00 WIB | `WEEKLY_HANDOVER_DAY`, `WEEKLY_CUTOFF_HOUR` |
| Minggu terkunci | `weeklyDeadlines().lockAt`, `isWeeklyLocked` | Jumat 17.00 WIB | `WEEKLY_LOCK_DAY` |
| Laporan kemajuan mingguan | `progressLockAt` | ikut kunci Jumat | — |
| Laporan kemajuan bulanan | `progressLockAt` | tanggal 3 bulan berikutnya, 17.00 WIB | — |
| Minggu ISO | `isoWeekOf`, `weekPeriodOf`, `parseWeekKey` | Senin 00.00 – Minggu 23.59 WIB | — |
| Tanggal dari klien | `parseWibDateKey("YYYY-MM-DD")` | tanggal mustahil → `null` | — |

Label tenggat untuk pesan (`DAILY_CUTOFF_LABEL` = "17.00 WIB", `WEEKLY_HANDOVER_LABEL`, `WEEKLY_LOCK_LABEL`) ikut nilai env, sehingga teks tidak pernah bertentangan dengan aturan. Laporan yang sudah terkunci hanya bisa dibuka lewat permintaan buka kunci, lihat [permintaan-akses.md](permintaan-akses.md#buka-kunci-laporan).

> Tenggat mingguan diputuskan 6 Okt 2026: serah Kamis 17.00 WIB dan kunci Jumat 17.00 WIB. Spesifikasi desain, data pratinjau, dan kode sudah memakai aturan yang sama. Laporan yang sudah diteruskan ke holding dibekukan sampai buka kunci dijalankan: mingguan lewat `weeklyWriteBlock` di `src/lib/lock.ts`, harian lewat `dailyGate` di `src/lib/daily-rollup.ts`. Keduanya memakai `activeUnlockFor` ([`unlock-requests.ts`](../../src/lib/unlock-requests.ts)); aturan yang sama dipakai `evidence-access.ts` untuk bukti.

## Status proyek, satu sumber

[`src/lib/project-status.ts`](../../src/lib/project-status.ts) → `deriveProjectStatus(project, latestReport)` adalah satu-satunya tempat status proyek dihitung. Ringkasan semua peran, Proyek, dan Entitas memakainya. Aturannya berurutan:

| Urutan | Kondisi | Status | Kata |
| --- | --- | --- | --- |
| 1 | `lifecycle = DITUTUP`, laporan terakhir `SELESAI`, atau progres ≥ 100 | `done` | Selesai |
| 2 | `targetEndDate` sudah lewat | `late` | Terlambat ("Lewat tenggat n hari", minimal 1) |
| 3 | Belum ada laporan harian | `neutral` | Belum mulai |
| 4 | Laporan terakhir `TERKENDALA`, `MENUNGGU_KEPUTUSAN`, atau `needsEscalation` | `risk` | Perlu perhatian (alasan = kalimat pertama kendala, maks 88 karakter) |
| 5 | Selain itu | `on` | Sesuai jadwal |

Urutan tampil daftar: `STATUS_ORDER` (late → risk → on → neutral → done).

## Model data

![Model data](img/model-data.svg)

Model dikelompokkan di [`prisma/schema.prisma`](../../prisma/schema.prisma):

- **Organisasi.**
  - `Entity` membentuk pohon `HOLDING → SUB_HOLDING → SECTOR → REGION → PT → UNIT` dengan `path` termaterialisasi. Cakupan dihitung dengan `path startsWith`.
  - `Division` (per PT, punya `headUserId`) dan `DivisionType`.
- **Pengguna.** `User` dengan `role`, `scopeEntityId`, `username`, `passwordHash`, `divisionId` untuk keanggotaan divisi (0015), dan `mustChangePassword` (0018).
- **Proyek.**
  - `Project`: `lifecycle` (DIUSULKAN, AKTIF, DITOLAK, DITUTUP, DIARSIPKAN), `phase`, `approvalChain[]`, dan `divisionId` (0015).
  - `ProjectApproval` dan `ProjectEntity` (PT terkait).
  - Model 6 Okt 2026: `Output` (0013), `ProjectStage`, `ProjectNote`, `DeadlineProposal` (0014), `NoteRead`, `OutputRevision` (0019), `ProjectReview` (0023).
- **Laporan harian.**
  - `DailyProjectReport`: satu per proyek per hari WIB.
  - `Task`: rincian kerja yang di-rollup menjadi laporan.
  - `Subtask`: milik tugas atau item mingguan.
  - `ProjectProgressReport`: laporan kemajuan mingguan/bulanan.
- **Laporan mingguan.** `WeeklyDivisionReport` (satu per divisi per minggu ISO) dan `WeeklyReportItem`, ditambah `WeeklyReportRead` (0017), `WeeklyDivisionSummary` (ringkasan untuk Direktur, 0021), dan `WeeklyReportComment` (tanggapan, 0023). `DailyReportRead` (0021) menyimpan tanda baca kepala divisi atas laporan harian.
- **Bukti.** `Evidence` bersifat polimorfik (`targetType` + `targetId`). Target: `DAILY_REPORT`, `WEEKLY_ITEM`, `TASK`, `PROGRESS_REPORT`, `OUTPUT`, `PROJECT_CLOSING`.
- **Kendali.** `Escalation`, `UnlockRequest`, `AuditLog`, `NotificationLog`, dan `KpiSnapshot`, ditambah `AccessRequest`, `ReminderRule` (0016), `Attendance` (0015; status `TERLAMBAT` sejak 0023), `ApprovalRequest` (materi/anggaran/cuti, 0023), dan `UndoToken` (0025).

Model F1–F2 sengaja dibuat **tanpa foreign key** (pola `WeeklyReportRead`), kecuali `NoteRead` → `ProjectNote` dan `OutputRevision` → `Output`, supaya model milik area lain tidak berubah. Keberadaan baris induk dan cakupannya dijaga di API.

Kolom status disimpan sebagai `String` dengan nilai yang didokumentasikan di komentar skema, bukan enum Postgres.

## Sistem desain `mk`

Komponen UI ada di [`src/components/mk/`](../../src/components/mk/index.ts). Ini port TSX dari `design-system/components`, dengan props yang sama seperti `index.d.ts`:

| Berkas | Komponen |
| --- | --- |
| `core.tsx` | `Icon`, `Button`, `IconButton`, `SegmentedControl`, `Chip`, `SearchField`, `AccentPicker`, `StatusBadge`, `Avatar`, `ProgressBar`, `ProgressRing`, `Card`, `NavItem`, `TabBar` |
| `data.tsx` | `Sparkline`, `StatTile`, `BarChart`, `AreaChart`, `DonutChart`, `ActivityRings`, `Heatmap`, `Timeline`, `FlowDiagram`, `DivisionBar` |
| `layout.tsx` | `AttentionItem`, `ProjectRow`, `ApprovalItem` (prop tambahan `approveVariant: 'primary' \| 'secondary'`, F4-B), `ActivityItem`, `PageHeader`, `Hero`, `EmptyNote`, `ErrorNote`, `Skeleton`, `DashboardSkeleton`, `DateBox` |
| `sheet.tsx` | `Sheet`: samping 440 di desktop, form sheet di tablet, layar didorong di ponsel. Punya fokus masuk/kembali, Esc, dan geser tepi. |

Pembantu bersama formulir ada di [`src/components/companies/parts.tsx`](../../src/components/companies/parts.tsx): `Field`, `SwitchRow`, `SectionTitle`, `selectCls`, dan `useConfirm` untuk konfirmasi hapus. Toast memakai sonner (`<SonnerToaster position="top-center" />` di [`layout.tsx`](../../src/app/layout.tsx), latar `surface`, `z-index: var(--z-toast)` di atas tab bar dan Sheet). Tindakan yang bisa dibalik memakai tombol "Urungkan"; untuk keputusan di server, `toastWithUndo` ([`undo-client.ts`](../../src/lib/undo-client.ts)) memanggil `POST /api/undo`, lihat [urungkan.md](urungkan.md).

Aturan yang ditegakkan di semua layar:

- **Nilai visual hanya dari token.** Sumbernya [`design-system/tokens.css`](../../design-system/tokens.css), lewat `var(--…)` atau kelas Tailwind bertoken (`bg-surface`, `text-ink-2`, `bg-accent-fill`).
- **Tema dan aksen.** Tema diatur `data-theme="light|dark"` di `<html>` (next-themes). Aksen diatur `data-accent` dengan nilai `merah`, `biru`, `hijau`, `ungu`, `oranye`, atau `grafit`, disimpan di localStorage `mk-tampilan`.
- **Status tetap**, selalu warna + ikon + kata lewat `StatusBadge`: Sesuai jadwal, Perlu perhatian, Terlambat, Selesai, Belum mulai.
- **Susunan layar.** Satu kalimat jawaban di atas setiap dashboard, maksimal 4 KPI, maksimal 1 tombol primer per kartu (antrean keputusan memakai `approveVariant="secondary"`), dan maksimal 1 kartu bergradien per layar. F4-A/F4-B memeriksa aturan ini otomatis di semua layar peran.
- **Detail di Sheet**, tidak pindah halaman.

![Pola Sheet](img/pola-sheet.svg)

## Kerangka: shell dan Dock

[`src/components/shell.tsx`](../../src/components/shell.tsx) memilih tata letak dari lebar layar:

| Lebar | Navigasi | Tab yang muat |
| --- | --- | --- |
| ≥ 1024 | Sidebar 248 px: logo, peran, `NavItem`, panel Tampilan, profil | semua |
| 600–1023 | Tab bar mengambang di tengah atas, avatar di kanan | ≤ 5 semua; lebih → 4 + "Lainnya" |
| < 600 | Tab bar kaca di bawah | ≤ 4 semua + "Tampilan"; lebih → 3 + "Lainnya" |

Alternatifnya Dock ([`src/components/dock.tsx`](../../src/components/dock.tsx)), dipilih di panel Tampilan:

| Layar | Bentuk Dock |
| --- | --- |
| Desktop | ala macOS, dengan magnifikasi |
| Tablet | ala iPadOS, sampai 8 ikon |
| Ponsel | kapsul kaca, 5 slot |

`⌥⌘D` menyalakan Dock sembunyi otomatis.

Preferensi tampilan ada di [`src/lib/tampilan.ts`](../../src/lib/tampilan.ts) dan dipasang sebagai `data-nav`, `data-accent`, dan `data-dock-autohide` di `<html>` oleh skrip [`tampilan-boot.ts`](../../src/lib/tampilan-boot.ts) sebelum render pertama, jadi tidak ada kedipan.

Perpindahan Sidebar ↔ Dock memakai View Transitions ([`src/lib/nav-transition.ts`](../../src/lib/nav-transition.ts)). Ikon bernama `nav-<id>` terbang ke posisi barunya. Kurvanya ada di [`mk-modules.css`](../../src/app/mk-modules.css). Di bawah `prefers-reduced-motion`, transisi menjadi pudar 200 ms.

Bagian kerangka lain:

- Tautan "Lewati ke isi" mengarah ke `<main id="isi">`.
- Badge navigasi diambil dari `/api/nav-badges` (`refreshNavBadges()` di [`src/components/pic/nav-badges.ts`](../../src/components/pic/nav-badges.ts)): laporan harian dan catatan untuk PIC; Persetujuan, Eskalasi, dan laporan mingguan belum dibaca untuk pengawas ([`oversight-badges.ts`](../../src/lib/oversight-badges.ts)).
- Palet pencarian ⌘K/Ctrl+K ([`search/command-palette.tsx`](../../src/components/search/command-palette.tsx)) dipasang sekali di kerangka untuk semua peran; hasilnya dibatasi cakupan di `/api/search`.
- Lonceng notifikasi diperbarui serentak lewat event jendela `mk:notifikasi-berubah`. Dalam mode Dock, lonceng header dashboard disembunyikan karena Dock desktop sudah punya lonceng.
- Akun dengan `mustChangePassword` diarahkan ke `/login/ganti-sandi` dari `/` dan `/login`; API lain menjawab 403 `MUST_CHANGE_PASSWORD`.

## Pustaka `src/lib`

| Berkas | Tanggung jawab |
| --- | --- |
| `auth.ts` | Cookie sesi HMAC, `getSessionUser`, `requireApiUser` (opsi `allowPendingPasswordChange`), cakupan (`scopeEntityIds`, `scopeUserIds`, `refuseUnscoped`) |
| `password.ts`, `password-policy.ts` | scrypt hash/verifikasi; kebijakan kata sandi 8–256 karakter |
| `api-error.ts` | `serverError`, `clientErrorMessage`: pesan umum untuk 500 |
| `rbac.ts` | Kapabilitas, tab, rantai persetujuan proyek, meja akun |
| `lock.ts`, `wib.ts` | Waktu WIB, tenggat, kunci, validasi laporan |
| `project-status.ts` | Status proyek |
| `daily-rollup.ts` | Tugas → status/progres laporan harian, sinkron jumlah bukti; `dailyGate` (beku setelah diteruskan) |
| `daily-intake.ts` | `countDailyIntake`: hitungan "laporan masuk" untuk Ringkasan dan Meja kerja |
| `evidence-access.ts`, `storage.ts` | Hak baca/tulis bukti, Supabase Storage (bucket `evidence`, URL 5 menit) |
| `pic-access.ts`, `pic-progress.ts` | Relasi akun ↔ proyek (PIC, KADIV, ADMIN, MASTER, VIEWER), notifikasi, audit; rumus progres dibanding rencana, tenggat terdekat, riwayat |
| `output-revisions.ts` | Riwayat catatan revisi output |
| `kadiv.ts`, `kadiv-math.ts` | Divisi yang dipimpin, tim, beban kerja, kehadiran, ringkasan mingguan untuk Direktur; rumus tepat waktu 30 hari dan draf poin |
| `admin-compliance.ts`, `admin-compliance-server.ts` | Kepatuhan per orang dan per divisi (Admin PT) |
| `oversight.ts`, `oversight-shared.ts`, `oversight-badges.ts` | Hak pengawas, persetujuan, tanggapan, tinjauan, badge nav |
| `group-panel.ts`, `system-status.ts`, `audit-scope.ts`, `audit-labels.ts` | Panel peran grup, kesehatan sistem dan cron, cakupan log, label aksi |
| `reminders.ts`, `reminders-pic.ts`, `reminder-rules.ts`, `admin-meta.ts` | Pengingat mingguan divisi, pengingat harian PIC (`remindPicDaily`), aturan pengingat otomatis dan nilai bawaannya |
| `kpi-math.ts`, `kpi-snapshot.ts` | Rumus dan penulisan `KpiSnapshot` BULANAN |
| `access-requests.ts`, `access-requesters.ts`, `account-desk.ts`, `accounts.ts`, `companies.ts` | Permintaan akses, pemohon terbatas, dan aturan meja akun |
| `unlock-requests.ts` | Buka kunci laporan, `activeUnlockFor` |
| `undo.ts`, `undo-client.ts` | Tiket Urungkan di server dan toast di klien |
| `security.ts`, `security-headers.ts`, `cron-auth.ts` | Pembatas laju, teks aman, CSP, rahasia cron |
| `constants.ts`, `format.ts`, `division-tone.ts`, `branding.ts` | Label, format tanggal/angka, warna divisi tetap, logo |

## Deploy dan pekerjaan terjadwal

Sasaran deploy: VPS ([`deploy/README.md`](../../deploy/README.md)).

| Bagian | Isi |
| --- | --- |
| VPS aplikasi | Caddy (HTTPS otomatis) → kontainer `monitor-karya:3000`. Kontainer non-root, root filesystem read-only, `cap_drop: ALL`, tanpa `ports:`. Layanan `migrate` menjalankan `prisma migrate deploy` setelah konfirmasi di `deploy.sh`. |
| Basis data | Kini Supabase. `deploy/db-vps` menyiapkan PostgreSQL 17 di VPS terpisah lewat WireGuard, dengan cadangan harian terenkripsi. |
| Berkas bukti | Tetap Supabase Storage (bucket privat `evidence`, URL bertanda tangan 5 menit). |
| Cron | [`deploy/app-vps/cron.sh`](../../deploy/app-vps/cron.sh) memanggil `/api/cron/<job>` dari **dalam** kontainer dengan `CRON_SECRET`, sehingga rahasia tidak ada di crontab host dan Caddy menolak `/api/cron/*` dari internet. |

| Job | Jadwal (WIB) | Isi |
| --- | --- | --- |
| `remind-divisions` | 09.00 Senin–Jumat | Pengingat capaian mingguan ke kepala divisi yang belum menyerahkan |
| `reminder-rules` | tiap 30 menit, 07–18 | Aturan pengingat otomatis per PT, pengembalian akses sementara, kunci ulang buka kunci yang habis |
| `kpi-snapshot` | 17.30 setiap hari | `KpiSnapshot` BULANAN per entitas pelapor |

Kunci laporan tidak bergantung pada cron: semuanya diturunkan dari jam WIB.

Integrasi akhir (6 Okt 2026) membangun image `--target runner` dan menjalankannya dengan `--read-only`, tmpfs, `--cap-drop ALL`, `AUTH_SECRET` dan `CRON_SECRET` acak, serta basis data tiruan: kontainer sehat, `/login` 200, `/pratinjau` 404, dan `/api/cron/*` tanpa rahasia 401. Belum diuji dengan basis data sungguhan.
