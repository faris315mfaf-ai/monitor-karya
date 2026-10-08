# Laporan T2-S1 — Audit otorisasi seluruh route API

Dikerjakan Zcode (agen T2-S1, bug hunter/auditor otorisasi), 8 Oktober 2026. Zona: `tests/security/**`, berkas route/lib yang berlubang (tidak ada yang perlu diubah), dan laporan ini. Cabang `codex/kerja`, tanpa commit. Basis rujukan: `docs/KEAMANAN.md`, `src/lib/rbac.ts`, `src/lib/auth.ts`, `src/lib/pic-access.ts`, `src/lib/evidence-access.ts`, `src/lib/audit-scope.ts`, `docs/fitur/matriks-fungsi-peran.md`.

## Statistik audit

| Ukuran | Nilai |
|---|---|
| Berkas route diperiksa | 73 dari 73 di `src/app/api` (100%) |
| Handler HTTP diperiksa | 134 (62 GET · 35 POST · 16 PATCH · 14 DELETE · 7 PUT) |
| Handler tulis (non-GET) diaudit lima lapis | 72 |
| Handler GET diperiksa cakupan/kebocoran | 62 |
| Celah nyata (eksploitabel) ditemukan | 0 |
| Temuan rendah (laporan + usulan, tanpa ubah kode) | 2 |
| Temuan informasional/konsistensi | 4 |
| Berkas kode produksi diubah | 0 |
| Tes baru | `tests/security/otorisasi-lapis.test.ts` — 22 tes, hijau |

## Cara pemeriksaan

Setiap ekspor HTTP diperiksa terhadap lima lapis: (1) `requireApiUser`/`getSessionUser`; (2) kapabilitas `can(role, …)` atau set peran setara (`isApprovalDecider`, `isProjectOverseer`, `decisionDesk`, dsb.); (3) pembatasan cakupan entitas (`resolveScopeEntityId`/`scopeEntityIds`/`refuseUnscoped`/`scopePathPrefix`); (4) relasi objek (`guardProjectAccess`/`relationTo`/`canWriteEvidence`/`audit-scope`/`canManageDivision`/`assertOwnsDivision`/`pickLedDivision` atau filter `where` setara); (5) gerbang status/kunci (`dailyGate`, `weeklyWriteBlock`, `isProgressLocked`, `activeUnlockFor`, status DIAJUKAN/DISETUJUI bersyarat `updateMany`, jendela urungkan 15 menit). Pola gagal-terbuka yang diperbaiki 6 Okt (KEAMANAN.md §1) diverifikasi ulang satu per satu; audit dilengkapi pemindaian otomatis bahwa setiap handler memanggil penjaga otentikasi (skrip Python; pengecualian terverifikasi: `auth/login`, `auth/activate`, `auth/logout`, `health/ready`, dan `ringkasan/laporan-dibaca` yang menautkan `requireApiUser` di helper `target()`).

## Matriks ringkas (route · metode · lapis · temuan)

Diringkas per kelompok pola; semua baris lolos lima lapis kecuali catatan pada kolom temuan.

| Kelompok route | Metode | Lapis yang ada | Temuan |
|---|---|---|---|
| `companies` | GET/POST/PATCH/DELETE | `requireApiUser` + `canManageAccounts`/`companies:manage`; Admin PT dipaku `scopeEntityId` (GET/POST); DELETE melarang hapus PT sendiri & PT berdata; `passwordHash` di-strip sebelum respons | Aman |
| `companies/users`, `companies/users/activation` | GET/POST/PATCH/DELETE | `accountDesk`/`deskReachError` (meja terbatas: PT sendiri + peran ADMIN_PT/KADIV/PIC saja); larangan pindah PT/lepas ke holding; `isLastSuperadmin`; aktivasi sekali pakai + `eligibleAccount` (meja + persetujuan AKUN_BARU) | Aman |
| `projects` | GET/POST/PATCH/DELETE | `project:propose`/`canManage`/`canSetLifecycle`; `proposalEntity` gagal-tertutup (peran berlingkup tanpa PT → 400); GET pakai `scopeEntityIds` + PT terkait | Aman. `skipApproval` bypass rantai = keputusan produk terdokumentasi (tahap INISIASI saja, audit `CREATE_PROJECT_NO_APPROVAL`) |
| `projects/approve` | POST | `project:approve` + `canSignSlot` (slot ADMIN_PT/DIREKTUR terpaku PT proyek); rantai kosong (data lama) tetap dicek jangkauan; klaim transaksional anti klik ganda | Aman |
| `daily-input` | GET/PUT/DELETE | `daily:input` + `ownsProject` (PIC=proyek sendiri, Admin PT=PT-nya, master=semua; tanpa PT gagal-tertutup); `dailyGate` membekukan laporan diteruskan/dikunci/lewat 17.00 kecuali `activeUnlockFor` | Aman |
| `tasks` | GET/POST/PUT/PATCH/DELETE | `guardProject` + `daily:input` untuk tulis; `lockCheck` (beku harian, kunci Jumat, buka kunci); PATCH memastikan semua kartu milik proyek+minggu yang sama | Tulis aman. GET untuk KEPALA_DIVISI membaca seluruh proyek di PT-nya (lihat temuan R-1) |
| `weekly-input` | GET/PUT/PATCH/DELETE/POST | `weekly:input`/`weekly:approve` + `assertOwnsDivision` (kepala divisi itu / Admin PT PT-nya / master; tanpa PT gagal-tertutup); `weeklyWriteBlock` + `activeUnlockFor`; alur status DRAFT→MENUNGGU→DISETUJUI dengan klaim bersyarat | Aman |
| `progress-reports` | GET/PUT/DELETE | `guardProject` + `daily:input` (tulis); `isProgressLocked`/`isLocked` | Tulis aman. GET KADIV sama dengan R-1; tidak ada jalur buka kunci (I-1) |
| `evidence`, `evidence/[id]`, `evidence/upload` | GET/POST/DELETE | `canWriteEvidence` (hanya PIC proyek / kepala divisi pelaksana / Admin PT PT-nya / master — peran pantau ditolak meski satu PT); `canReadEvidence` ikut subtree entitas; target beku (laporan diteruskan/dikunci, output menunggu review/diterima) → 409 kecuali buka kunci aktif | Aman |
| `inbox` | GET/POST | `daily:forward`/`weekly:forward`; POST gagal-tertutup (`report.entityId !== scopeEntityId` → 403, master dikecualikan); syarat submitted/DISETUJUI; klaim `updateMany` anti klik ganda; penerusan = beku + tiket urungkan | Aman |
| `undo` | POST | `applyUndo`: tiket pelaku sama, 15 menit, sekali pakai; kapabilitas diperiksa ulang (`UNDO_CAPABILITIES`) + jangkauan entitas (`scopeEntityIds`); sidik keadaan (stamp) anti penimpaan; tolak bila sudah ada pengajuan buka kunci | Aman (dipatri juga oleh `s2-undo-jendela`) |
| `unlock-requests` | GET/POST/PATCH | `unlock:request`/`approve`/`execute`; target harus dalam `scopeEntityIds` (404 bila di luar); PIC hanya DAILY_REPORT proyeknya; tak ada yang memutuskan pengajuannya sendiri; klaim status bersyarat | Aman |
| `access-requests` (+`/options`) | GET/POST/PATCH | `refuseUnscoped`; `limitedRequestRefusal` (KADIV/PIC hanya timnya, posisi PIC/KADIV); pembaca: meja PT-nya atau milik sendiri; keputusan `decisionDesk`+`mayDecideFor`, bukan permintaan sendiri; penerapan lewat `applyAccessRequest` (aturan meja sama) dalam satu transaksi | Aman |
| `escalations`, `escalations/actions` | GET/POST | `escalation:raise/followup/decide`; raise: PIC/KADIV harus pemilik sumber + `scopeEntityIds`; transisi status DIAJUKAN→DITINJAU→DIPUTUSKAN→DITUTUP; close oleh pemutus/pengikut/pengaju | Aman |
| `approval-requests` (+`/berkas`) | GET/POST/PATCH | `isApprovalRequester` (KADIV/PIC) dengan `projectScopeWhere`/`ledDivisions`; keputusan `canDecideApprovalIn` (DIREKTUR hanya cakupannya; di luar cakupan = 404); pengaju tak memutuskan miliknya; undo 15 menit oleh pemutus sendiri; berkas hanya pengaju (POST) dan pengaju+pengawas-bercakupat (GET) | Aman |
| `weekly-comments` | GET/POST/PATCH/DELETE | `weeklyRelation` (READER tercakup PT / HEAD divisi itu / ADMIN satu PT / master); komentar hanya laporan terserah; PATCH tandai-dibaca hanya HEAD; DELETE milik sendiri ≤ 15 menit | Aman |
| `project-notes`, `project-stages`, `project-reviews`, `deadline-proposals`, `outputs` (+`/review`) | GET/POST/PUT/PATCH/DELETE | `guardProjectAccess` dengan relasi per aksi (PIC_WRITE = PIC/ADMIN/MASTER; REVIEW = KADIV divisi itu + cek `divisionProjects`; catatan = PIC/KADIV/ADMIN + pengawas `isProjectOverseer`); keputusan tenggat `canDecideDeadline` + bukan pengaju; output dibekukan saat MENUNGGU_REVIEW/DITERIMA (bukti ikut beku via `canWriteEvidence`) | Aman |
| `admin/compliance` (+`/remind`), `admin/reminder-rules`, `admin/overview`, `admin/activity` | GET/POST/PATCH | `COMPLIANCE_ROLES`/`ALLOWED`/`reminderDesk`/`users:manage`; `resolveEntityScope` tak bisa melebarkan; remind hanya proyek PT akun (`scopeProjects`) + `limitReminders`; activity pakai `auditScopeWhere` (null → 403) | Aman |
| `kadiv/members`, `kadiv/team`, `kadiv/weekly-summary`, `attendance` | GET/POST/PUT/PATCH/DELETE | `canManageDivision`/`pickLedDivision` (divisi yang dipimpin; Admin PT PT-nya; master); anggota/proyek harus satu PT dengan divisi; KADIV tak bisa menarik aset divisi lain; `canRecordFor` (atasan tim, bukan diri sendiri kecuali master); `markMemberRead`/`remindTeam` memeriksa anggota tim | Aman |
| `work-desk`, `notifications` (+`/remind`) | GET/POST/PATCH | meja diambil dari sesi; remind-pic gagal-tertutup di `remindPicDaily` (hanya `group:read` lintas PT); remind-all hanya PT sendiri; notifications GET/PATCH selalu `userId` sendiri; remind divisi di-cek lingkup + `refuseUnscoped` | Aman |
| `auth/login`, `auth/logout`, `auth/me`, `auth/activate`, `profile` (+`/password`) | POST/GET/PATCH | publik terbatas (login rate-limit + verifikasi hash tiruan; aktivasi token sekali pakai); logout hanya mencabut sesi token sendiri; profil/sandi hanya kolom sendiri dengan kata sandi lama | Aman (kebijakan sandi/sesi tidak disentuh) |
| `cron/*`, `health/*` | GET/POST | `refuseCron` (CRON_SECRET ≥16, waktu-konstan); `health/internal`+`backup` pakai `OPS_HEALTH_SECRET`/`BACKUP_REPORT_SECRET`; `health/ready` & `health` tanpa otentikasi tetapi hanya `{ok,status}` | Aman; `health/ready` tanpa otentikasi disengaja (probe) |
| `ringkasan`, `ringkasan/laporan-dibaca`, `dashboard`, `entity-activity`, `entities` (+`/[id]`), `daily-reports`, `weekly-reports`, `escalations` GET, `late-incidents`, `kpi-trends`, `management-charts`, `compliance-map`, `search`, `roles`, `system`, `system/grup`, `nav-badges`, `my-dashboard`, `compliance-map` | GET | `scopeEntityIds`/`scopePathPrefix`/`resolveScopeEntityId` (param kueri hanya bisa menyempitkan peran global); `refuseUnscoped`; `roles`/`system`/`system/grup` bergerbang peran; `search` dan `audit-logs`(+`/export`) sudah dipatri tes yang ada | Aman terhadap lintas entitas. Tanpa gerbang peran → lihat temuan R-2 |

## Temuan per severity

### Kritis / tinggi / sedang

Tidak ditemukan. Semua handler tulis lolos lima lapis; pola gagal-terbuka yang diidentifikasi 6 Okt sudah tertutup dan kini dipatri tes (lihat "Perbaikan yang dilakukan"). Tes `auditor-readonly.test.ts` yang menyapu semua route tulis tetap valid.

### Rendah (dilaporkan dengan usulan; kode TIDAK diubah)

**R-1 — `GET /api/tasks` & `GET /api/progress-reports`: kepala divisi membaca seluruh proyek di PT-nya.**
`guardProject` di kedua route memakai pola `project.entityId === user.scopeEntityId` untuk semua peran non-PIC non-master, sehingga KEPALA_DIVISI (dan DIREKTUR_ENTITAS) dapat membaca task/laporan kemajuan proyek divisi lain dalam satu PT. Ini lebih lebar dari relasi divisi yang dipakai `relationTo`/`kadivProjectWhere`/`buildTeam`, tetapi masih di dalam batas entitas (tidak menembus PT lain) dan tulis tetap ditolak (KADIV tidak punya `daily:input`). Usulan: di kedua `guardProject`, untuk `KEPALA_DIVISI` ganti cek entitas dengan `kadivProjectWhere(user.id)`; dampak: menyempitkan baca KADIV ke proyek divisinya, konsisten dengan `relationTo('KADIV')`. Tidak diubah karena bukan pelanggaran batas entitas dan berisiko mengubah perilaku sah yang belum dipastikan pemilik produk.

**R-2 — Route baca agregat tanpa gerbang peran menyajikan detail lintas divisi dalam satu PT ke semua peran berlingkup (termasuk PIC).**
`ringkasan`, `entity-activity`, `dashboard`, `daily-reports`, `escalations` (GET), `late-incidents`, `weekly-reports`, `management-charts` hanya memakai `scopeEntityIds` (subtree entitas) tanpa memeriksa peran, sehingga PIC dapat membaca teks capaian/kendala/output PIC lain di PT-nya. Ini konsisten dengan semantik `scopeEntityIds` ("entitas yang boleh dibaca akun" — auth.ts) dan matriks fungsi menempatkan route ini pada peran pemantau, jadi bukan pelanggaran model cakupan, tetapi permukaan bacanya lebih luas daripada kebutuhan peran. Usulan (penguatan opsional): tambahkan gerbang peran pemantau (`group:read`/`audit:read`/pemilik PT) atau saring dengan `projectScopeWhere` untuk peran pelaksana. Butuh keputusan pemilik produk karena dapat memutus konsumen UI yang tidak terdokumentasi.

### Informasional

- **I-1 — Laporan kemajuan (PROGRESS_REPORT) tidak punya jalur buka kunci.** `UNLOCK_TARGETS` hanya `DAILY_REPORT|WEEKLY_REPORT`, tetapi `PUT/DELETE /api/progress-reports` menjawab 409 "Ajukan permohonan buka kunci" dan `evidence-access` tidak berkonsultasi ke `activeUnlockFor` untuk target PROGRESS_REPORT. Gagal-tertutup (tidak eksploitabel); hanya pesan yang menyesatkan. Usulan: tambahkan PROGRESS_REPORT ke `UNLOCK_TARGETS` + cabang `activeUnlockFor`, atau ganti pesannya.
- **I-2 — `ringkasan/laporan-dibaca` READERS tidak memuat TI** (Manajemen/Direktur/SDM/Superadmin saja). Ketersediaan, bukan keamanan.
- **I-3 — AUDITOR ditolak `GET /api/tasks`** (pola `owns` membandingkan `scopeEntityId` yang null). Gagal-tertutup; ketersediaan untuk peran baca-saja.
- **I-4 — `health/ready` dan `health` tanpa otentikasi** menyasar probe infrastruktur; isi hanya `{ok,status}`. Sudah demikian secara desain (`docs/KEAMANAN.md` tidak mengklaim sebaliknya).

## Perbaikan yang dilakukan

Tidak ada celah nyata, jadi tidak ada patch kode produksi (sesuai mandat: celah teoretis hanya dilaporkan). Yang ditambahkan:

- **`tests/security/otorisasi-lapis.test.ts`** — 22 tes regresi yang mematri lima lapis pada route yang paling sering diserang, memakai fixture yang sudah ada (`tests/api/admin-fake-db.ts` + `tests/api/test-session.ts`, sesi HMAC sungguhan, tanpa DB nyata, tanpa dependensi baru):
  - Lapis 1: tanpa cookie → 401; akun dinonaktifkan → 401.
  - Lapis 3 (penerusan/pengingat gagal-tertutup): Admin PT lain dan Admin PT **tanpa PT** ditolak meneruskan laporan PT A (403, laporan tak berubah, tanpa audit); GET inbox akun tanpa PT → 400; `remind-pic` lintas PT → 403 tanpa notifikasi terkirim; kontrol positif pemilik PT → 200.
  - Lapis 4 (relasi objek): PIC PT B → task proyek PT A 403; KADIV menulis papan mingguan divisi PT lain 403; Direktur satu PT tidak bisa melampirkan bukti (403).
  - Lapis 5 (status/kunci): setelah diteruskan, PUT laporan PIC → 409 `frozen:'FORWARDED'`; lampirkan bukti ke laporan beku → 409.
  - Lapis 2 (kapabilitas): eksekusi buka kunci oleh Direktur → 403; persetujuan mingguan oleh Admin PT → 403; pengajuan buka kunci oleh KADIV → 403; pengaju tidak memutuskan permintaannya sendiri; Direktur PT B terhadap permintaan PT A → 404 (di luar cakupan = tidak ada); Admin PT A tidak memutuskan permintaan akses PT B → 403; KADIV tidak mengeskalasi task proyek yang PIC-nya bukan dirinya → 403; meja akun terbatas tidak bisa memindahkan akun ke PT lain/melepas ke holding → 403; pengajuan proyek oleh akun tanpa PT → 400 tanpa baris baru.
  - Lapis baca: `audit-logs` tanpa `audit:read` hanya jejak sendiri; Direktur entitas hanya subtree PT-nya (baris PT B dan auto PT B tidak bocor).

## Hasil uji

| Uji | Hasil |
|---|---|
| `npx vitest run tests/security/otorisasi-lapis.test.ts` | 22/22 lulus |
| `npx vitest run tests/security` (snapshot saat sepi) | 6 berkas / 62 tes lulus (termasuk 5 berkas milik agen T2-S2) |
| `npx vitest run tests/security` (run berikutnya) | sebagian berkas T2-S2 (proxy-csrf, sesi-token) merah — akibat edit berjalan agen paralel pada `src/proxy.ts`/sesi saat audit berlangsung, bukan dari berkas ini; berkas ini tetap 22/22 |
| `npx tsc --noEmit --incremental false` (env dummy) | 0 galat dari berkas ini; 25 galat tersisa di `tests/qa/keyboard/*` dan 7 di `s2-*.test.ts` (zona agen lain, tidak disentuh) |
| `npx eslint tests/security/otorisasi-lapis.test.ts` | bersih |

## Keterbatasan

- Audit statis + tes terhadap basis data tiruan di memori (`admin-fake-db`) — bukan PostgreSQL asli; perilaku transaksi/`FOR UPDATE` ditiru sebagian, jadi kondisi balapan nyata tidak dibuktikan di sini (route sudah memakai klaim bersyarat + transaksi untuk itu).
- Waktu dibekukan (Selasa 6 Okt 2026 10.00 WIB); batas tenggat 17.00/kunci Jumat diuji pada sisi "belum terkunci" saja — sisi terkunci sudah tercakup tes `tests/api/weekly-input.test.ts` dan `daily-input.test.ts` yang ada.
- Tidak menjalankan server/dev, proxy nyata, E2E HTTP, dan tidak menguji Supabase/produksi (larangan tugas). `next build` tidak dijalankan.
- Komentar/diagram alur di luar `src/app/api` (mis. pekerjaan cron) diperiksa hanya pada pagar otentikasinya.
- `tests/security/` adalah direktori bersama dengan agen T2-S2 yang aktif bekerja; hasil "hijau penuh" adalah snapshot — gerbang akhir sebaiknya dijalankan ulang setelah semua agen selesai.
