# Inventaris kode pada snapshot handoff

Dibuat dari berkas sumber Git pada8 Oktober 2026. Daftar ini bukan audit cakupan otorisasi; metode diambil dari deklarasi ekspor route. Tidak memuat nilai env atau kredensial.

## Endpoint API

| Endpoint | Metode diekspor | Sumber |
|---|---|---|
| `/api/access-requests/options` | GET | [route](../../src/app/api/access-requests/options/route.ts) |
| `/api/access-requests` | GET, POST, PATCH | [route](../../src/app/api/access-requests/route.ts) |
| `/api/admin/activity` | GET | [route](../../src/app/api/admin/activity/route.ts) |
| `/api/admin/compliance/remind` | POST | [route](../../src/app/api/admin/compliance/remind/route.ts) |
| `/api/admin/compliance` | GET | [route](../../src/app/api/admin/compliance/route.ts) |
| `/api/admin/overview` | GET | [route](../../src/app/api/admin/overview/route.ts) |
| `/api/admin/reminder-rules` | GET, PATCH | [route](../../src/app/api/admin/reminder-rules/route.ts) |
| `/api/approval-requests/berkas` | GET, POST | [route](../../src/app/api/approval-requests/berkas/route.ts) |
| `/api/approval-requests` | GET, POST, PATCH | [route](../../src/app/api/approval-requests/route.ts) |
| `/api/attendance` | GET, POST, DELETE | [route](../../src/app/api/attendance/route.ts) |
| `/api/audit-logs/export` | GET | [route](../../src/app/api/audit-logs/export/route.ts) |
| `/api/audit-logs` | GET | [route](../../src/app/api/audit-logs/route.ts) |
| `/api/auth/activate` | POST | [route](../../src/app/api/auth/activate/route.ts) |
| `/api/auth/login` | POST | [route](../../src/app/api/auth/login/route.ts) |
| `/api/auth/logout` | POST | [route](../../src/app/api/auth/logout/route.ts) |
| `/api/auth/me` | GET | [route](../../src/app/api/auth/me/route.ts) |
| `/api/companies` | GET, POST, PATCH, DELETE | [route](../../src/app/api/companies/route.ts) |
| `/api/companies/users/activation` | GET, POST | [route](../../src/app/api/companies/users/activation/route.ts) |
| `/api/companies/users` | GET, POST, PATCH, DELETE | [route](../../src/app/api/companies/users/route.ts) |
| `/api/compliance-map` | GET | [route](../../src/app/api/compliance-map/route.ts) |
| `/api/cron/kpi-snapshot` | GET | [route](../../src/app/api/cron/kpi-snapshot/route.ts) |
| `/api/cron/remind-divisions` | GET | [route](../../src/app/api/cron/remind-divisions/route.ts) |
| `/api/cron/reminder-rules` | GET | [route](../../src/app/api/cron/reminder-rules/route.ts) |
| `/api/daily-input` | GET, DELETE, PUT | [route](../../src/app/api/daily-input/route.ts) |
| `/api/daily-reports` | GET | [route](../../src/app/api/daily-reports/route.ts) |
| `/api/dashboard` | GET | [route](../../src/app/api/dashboard/route.ts) |
| `/api/deadline-proposals` | GET, POST, PATCH | [route](../../src/app/api/deadline-proposals/route.ts) |
| `/api/entities/[id]` | GET | [route](../../src/app/api/entities/[id]/route.ts) |
| `/api/entities` | GET | [route](../../src/app/api/entities/route.ts) |
| `/api/entity-activity` | GET | [route](../../src/app/api/entity-activity/route.ts) |
| `/api/escalations/actions` | POST | [route](../../src/app/api/escalations/actions/route.ts) |
| `/api/escalations` | GET | [route](../../src/app/api/escalations/route.ts) |
| `/api/evidence/[id]` | GET, DELETE | [route](../../src/app/api/evidence/[id]/route.ts) |
| `/api/evidence` | GET, POST | [route](../../src/app/api/evidence/route.ts) |
| `/api/evidence/upload` | POST | [route](../../src/app/api/evidence/upload/route.ts) |
| `/api/health/backup` | POST | [route](../../src/app/api/health/backup/route.ts) |
| `/api/health/internal` | GET | [route](../../src/app/api/health/internal/route.ts) |
| `/api/health/ready` | GET | [route](../../src/app/api/health/ready/route.ts) |
| `/api/health` | GET | [route](../../src/app/api/health/route.ts) |
| `/api/inbox` | GET, POST | [route](../../src/app/api/inbox/route.ts) |
| `/api/kadiv/members` | GET, PUT | [route](../../src/app/api/kadiv/members/route.ts) |
| `/api/kadiv/team` | GET, POST | [route](../../src/app/api/kadiv/team/route.ts) |
| `/api/kadiv/weekly-summary` | GET, PUT, POST | [route](../../src/app/api/kadiv/weekly-summary/route.ts) |
| `/api/kpi-trends` | GET | [route](../../src/app/api/kpi-trends/route.ts) |
| `/api/late-incidents` | GET | [route](../../src/app/api/late-incidents/route.ts) |
| `/api/management-charts` | GET | [route](../../src/app/api/management-charts/route.ts) |
| `/api/my-dashboard` | GET | [route](../../src/app/api/my-dashboard/route.ts) |
| `/api/nav-badges` | GET | [route](../../src/app/api/nav-badges/route.ts) |
| `/api/notifications/remind` | GET, POST | [route](../../src/app/api/notifications/remind/route.ts) |
| `/api/notifications` | GET, PATCH | [route](../../src/app/api/notifications/route.ts) |
| `/api/outputs/review` | GET, POST | [route](../../src/app/api/outputs/review/route.ts) |
| `/api/outputs` | GET, POST, PATCH, DELETE | [route](../../src/app/api/outputs/route.ts) |
| `/api/profile/password` | POST | [route](../../src/app/api/profile/password/route.ts) |
| `/api/profile` | GET, PATCH | [route](../../src/app/api/profile/route.ts) |
| `/api/progress-reports` | GET, PUT, DELETE | [route](../../src/app/api/progress-reports/route.ts) |
| `/api/project-notes` | GET, POST, PATCH | [route](../../src/app/api/project-notes/route.ts) |
| `/api/project-progress` | GET | [route](../../src/app/api/project-progress/route.ts) |
| `/api/project-reviews` | GET, POST, DELETE | [route](../../src/app/api/project-reviews/route.ts) |
| `/api/project-stages` | GET, POST, PUT, PATCH, DELETE | [route](../../src/app/api/project-stages/route.ts) |
| `/api/projects/approve` | POST | [route](../../src/app/api/projects/approve/route.ts) |
| `/api/projects` | GET, POST, PATCH, DELETE | [route](../../src/app/api/projects/route.ts) |
| `/api/ringkasan/laporan-dibaca` | POST, DELETE | [route](../../src/app/api/ringkasan/laporan-dibaca/route.ts) |
| `/api/ringkasan` | GET | [route](../../src/app/api/ringkasan/route.ts) |
| `/api/roles` | GET | [route](../../src/app/api/roles/route.ts) |
| `/api/search` | GET | [route](../../src/app/api/search/route.ts) |
| `/api/system/grup` | GET | [route](../../src/app/api/system/grup/route.ts) |
| `/api/system` | GET | [route](../../src/app/api/system/route.ts) |
| `/api/tasks` | GET, POST, PUT, PATCH, DELETE | [route](../../src/app/api/tasks/route.ts) |
| `/api/undo` | POST | [route](../../src/app/api/undo/route.ts) |
| `/api/unlock-requests` | GET, POST, PATCH | [route](../../src/app/api/unlock-requests/route.ts) |
| `/api/weekly-comments` | GET, POST, PATCH, DELETE | [route](../../src/app/api/weekly-comments/route.ts) |
| `/api/weekly-input` | GET, PUT, PATCH, DELETE, POST | [route](../../src/app/api/weekly-input/route.ts) |
| `/api/weekly-reports` | GET | [route](../../src/app/api/weekly-reports/route.ts) |
| `/api/work-desk` | GET, POST | [route](../../src/app/api/work-desk/route.ts) |

Total: 74 berkas route API.

## Model Prisma

`Entity`, `DivisionType`, `Division`, `Project`, `ProjectEntity`, `ProjectApproval`, `ProjectProgressReport`, `AdminAppointment`, `AspectCategory`, `Priority`, `WorkCalendar`, `Holiday`, `AuthSession`, `AccountActivation`, `User`, `DailyProjectReport`, `WeeklyDivisionReport`, `WeeklyReportItem`, `Evidence`, `Note`, `Escalation`, `UnlockRequest`, `AuditLog`, `LateIncident`, `SpotCheck`, `NotificationLog`, `KpiSnapshot`, `Task`, `Subtask`, `Output`, `ProjectNote`, `ProjectStage`, `DeadlineProposal`, `Attendance`, `AccessRequest`, `ReminderRule`, `WeeklyReportRead`, `NoteRead`, `OutputRevision`, `WeeklyDivisionSummary`, `DailyReportRead`, `WeeklyReportComment`, `ProjectReview`, `ApprovalRequest`, `UndoToken`.

Total 45 model; relasi, constraint, tipe dan indeks lengkap pada [schema](../../prisma/schema.prisma).

## Migrasi

- [0001_init](../../prisma/migrations/0001_init/migration.sql)
- [0002_enable_rls](../../prisma/migrations/0002_enable_rls/migration.sql)
- [0003_fk_indexes](../../prisma/migrations/0003_fk_indexes/migration.sql)
- [0004_user_password](../../prisma/migrations/0004_user_password/migration.sql)
- [0005_role_workflow_links](../../prisma/migrations/0005_role_workflow_links/migration.sql)
- [0006_evidence_storage_bucket](../../prisma/migrations/0006_evidence_storage_bucket/migration.sql)
- [0007_task_and_subtask](../../prisma/migrations/0007_task_and_subtask/migration.sql)
- [0008_weekly_item_tags_and_subtasks](../../prisma/migrations/0008_weekly_item_tags_and_subtasks/migration.sql)
- [0009_progress_reports_and_project_approval](../../prisma/migrations/0009_progress_reports_and_project_approval/migration.sql)
- [0010_weekly_board_and_app_notifications](../../prisma/migrations/0010_weekly_board_and_app_notifications/migration.sql)
- [0011_usernames_and_company_identity](../../prisma/migrations/0011_usernames_and_company_identity/migration.sql)
- [0012_project_chain_purpose_related](../../prisma/migrations/0012_project_chain_purpose_related/migration.sql)
- [0013_outputs](../../prisma/migrations/0013_outputs/migration.sql)
- [0014_pic_features](../../prisma/migrations/0014_pic_features/migration.sql)
- [0015_kadiv_features](../../prisma/migrations/0015_kadiv_features/migration.sql)
- [0016_admin_features](../../prisma/migrations/0016_admin_features/migration.sql)
- [0017_oversight](../../prisma/migrations/0017_oversight/migration.sql)
- [0018_auth_password](../../prisma/migrations/0018_auth_password/migration.sql)
- [0019_note_reads](../../prisma/migrations/0019_note_reads/migration.sql)
- [0021_kadiv_more](../../prisma/migrations/0021_kadiv_more/migration.sql)
- [0023_oversight_more](../../prisma/migrations/0023_oversight_more/migration.sql)
- [0025_undo](../../prisma/migrations/0025_undo/migration.sql)
- [0026_review_decision_fk_indexes](../../prisma/migrations/0026_review_decision_fk_indexes/migration.sql)
- [0027_auth_sessions](../../prisma/migrations/0027_auth_sessions/migration.sql)
- [0028_account_activation](../../prisma/migrations/0028_account_activation/migration.sql)

## Nama variabel lingkungan dalam sumber TypeScript/JavaScript

Inventaris statis `process.env.NAMA`/`env('NAMA')`, bukan jaminan kelengkapan shell/Docker atau daftar semua variabel wajib. Untuk kewajiban dan panjang rahasia lihat panduan lingkungan, CX20 dan contoh env. Hanya nama dan lokasi, tanpa nilai.

| Nama | Lokasi contoh |
|---|---|
| `APP_ORIGINS` | [sumber](../../src/proxy.ts) |
| `AUTH_SECRET` | [sumber](../../src/lib/auth.ts) |
| `BACKUP_REPORT_SECRET` | [sumber](../../scripts/uji-keamanan-lanjutan-lokal.ts) |
| `CRON_SECRET` | [sumber](../../scripts/uji-keamanan-lanjutan-lokal.ts) |
| `CX16_APP_URL` | [sumber](../../scripts/uji-keamanan-lanjutan-lokal.ts) |
| `CX16_ISOLATED` | [sumber](../../scripts/uji-keamanan-lanjutan-lokal.ts) |
| `DATABASE_URL` | [sumber](../../prisma.config.ts) |
| `DIRECT_URL` | [sumber](../../prisma.config.ts) |
| `MK_E2E_NOW` | [sumber](../../tests/e2e-lokal/clock.mjs) |
| `NEXT_PUBLIC_SUPABASE_URL` | [sumber](../../src/lib/operational-health.ts) |
| `NODE_ENV` | [sumber](../../src/app/pratinjau/page.tsx) |
| `OPS_HEALTH_SECRET` | [sumber](../../scripts/uji-keamanan-lanjutan-lokal.ts) |
| `PATH` | [sumber](../../tests/cx/operational-scripts.test.ts) |
| `S3_ACCESS_KEY_ID` | [sumber](../../src/lib/security-headers.ts) |
| `S3_BUCKET` | [sumber](../../src/lib/security-headers.ts) |
| `S3_ENDPOINT` | [sumber](../../src/lib/security-headers.ts) |
| `S3_FORCE_PATH_STYLE` | [sumber](../../src/lib/security-headers.ts) |
| `S3_REGION` | [sumber](../../src/lib/security-headers.ts) |
| `S3_SECRET_ACCESS_KEY` | [sumber](../../src/lib/security-headers.ts) |
| `SEED_PASSWORD` | [sumber](../../scripts/demo-accounts.ts) |
| `STORAGE_DRIVER` | [sumber](../../src/app/api/evidence/upload/route.ts) |
| `SUPABASE_SERVICE_ROLE_KEY` | [sumber](../../src/lib/operational-health.ts) |
| `SUPERADMIN_PASSWORD` | [sumber](../../scripts/buat-superadmin.ts) |
| `TEST_BODY` | [sumber](../../tests/cx/operational-scripts.test.ts) |
| `TEST_STATUS` | [sumber](../../tests/cx/operational-scripts.test.ts) |

## Skrip dan konfigurasi

Jangan menjalankan skrip akun/seed/migrasi/deploy tanpa membaca guard dan memverifikasi target.

- [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- [Dockerfile](../../Dockerfile)
- [docker-compose.dev.yml](../../docker-compose.dev.yml)
- [package-lock.json](../../package-lock.json)
- [package.json](../../package.json)
- [prisma.config.ts](../../prisma.config.ts)
- [scripts/buat-superadmin.ts](../../scripts/buat-superadmin.ts)
- [scripts/db-lokal.sh](../../scripts/db-lokal.sh)
- [scripts/demo-accounts.ts](../../scripts/demo-accounts.ts)
- [scripts/guard-db-lokal.ts](../../scripts/guard-db-lokal.ts)
- [scripts/mulai-codex.sh](../../scripts/mulai-codex.sh)
- [scripts/seed.ts](../../scripts/seed.ts)
- [scripts/set-passwords.ts](../../scripts/set-passwords.ts)
- [scripts/sinkron-codex.sh](../../scripts/sinkron-codex.sh)
- [scripts/uji-alur-lokal.ts](../../scripts/uji-alur-lokal.ts)
- [scripts/uji-keamanan-lanjutan-lokal.ts](../../scripts/uji-keamanan-lanjutan-lokal.ts)
- [scripts/vercel-secrets.cmd](../../scripts/vercel-secrets.cmd)
- [scripts/vercel-secrets.sh](../../scripts/vercel-secrets.sh)
- [vitest.config.mts](../../vitest.config.mts)
