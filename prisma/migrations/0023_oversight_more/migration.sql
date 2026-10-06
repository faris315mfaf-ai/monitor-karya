-- 0023 — [F2-DIREKTUR] fungsi Direktur & Manajemen yang tersisa (6 Okt 2026).
--
-- WeeklyReportComment: "Beri tanggapan" pada laporan mingguan divisi
--   (02-direktur.md). Ditulis pengawas, dibalas kepala divisi; readAt = kapan
--   kepala divisi membacanya.
-- ProjectReview: "Tandai sudah ditinjau" pada detail proyek (01 & 02).
-- ApprovalRequest: persetujuan materi, anggaran, dan cuti. Diajukan kepala
--   divisi atau PIC, diputuskan Direktur entitas (PT-nya) atau Manajemen /
--   Direksi holding / Super Admin / TI. Berkas pendukung disimpan di Supabase
--   Storage (bucket evidence, prefix APPROVAL_REQUEST/), kolom file*.
--
-- Ketiganya tanpa foreign key (pola WeeklyReportRead, 0017): keberadaan dan
-- cakupan baris induk dijaga di API, sehingga model milik area lain tidak berubah.
-- Kehadiran "Terlambat": Attendance.status bertipe TEXT, tetapi 0015 memasang
-- CHECK "Attendance_status_check" (HADIR/CUTI/SAKIT/IZIN); diperluas di bawah.

CREATE TABLE "WeeklyReportComment" (
  "id"             TEXT NOT NULL,
  "weeklyReportId" TEXT NOT NULL,
  "authorId"       TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "readAt"         TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyReportComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WeeklyReportComment_weeklyReportId_createdAt_idx" ON "WeeklyReportComment"("weeklyReportId", "createdAt");
CREATE INDEX "WeeklyReportComment_authorId_idx" ON "WeeklyReportComment"("authorId");
ALTER TABLE "WeeklyReportComment" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "ProjectReview" (
  "id"         TEXT NOT NULL,
  "projectId"  TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "note"       TEXT,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectReview_projectId_reviewedAt_idx" ON "ProjectReview"("projectId", "reviewedAt");
CREATE INDEX "ProjectReview_reviewerId_idx" ON "ProjectReview"("reviewerId");
ALTER TABLE "ProjectReview" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "ApprovalRequest" (
  "id"            TEXT NOT NULL,
  "type"          TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "description"   TEXT,
  "amount"        BIGINT,
  "entityId"      TEXT NOT NULL,
  "divisionId"    TEXT,
  "projectId"     TEXT,
  "requestedById" TEXT NOT NULL,
  "startDate"     TIMESTAMP(3),
  "endDate"       TIMESTAMP(3),
  "status"        TEXT NOT NULL DEFAULT 'DIAJUKAN',
  "decidedById"   TEXT,
  "decidedAt"     TIMESTAMP(3),
  "decisionNote"  TEXT,
  "appliedData"   TEXT,
  "fileKey"       TEXT,
  "fileName"      TEXT,
  "fileMime"      TEXT,
  "fileSize"      INTEGER,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApprovalRequest_entityId_status_idx" ON "ApprovalRequest"("entityId", "status");
CREATE INDEX "ApprovalRequest_requestedById_idx" ON "ApprovalRequest"("requestedById");
CREATE INDEX "ApprovalRequest_decidedById_idx" ON "ApprovalRequest"("decidedById");
CREATE INDEX "ApprovalRequest_projectId_idx" ON "ApprovalRequest"("projectId");
CREATE INDEX "ApprovalRequest_divisionId_idx" ON "ApprovalRequest"("divisionId");
ALTER TABLE "ApprovalRequest" ENABLE ROW LEVEL SECURITY;

-- [GERBANG] Perluas CHECK status kehadiran agar TERLAMBAT (kadiv.ts
-- ATTENDANCE_STATUSES) tidak ditolak basis data.
ALTER TABLE "Attendance" DROP CONSTRAINT IF EXISTS "Attendance_status_check";
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_status_check"
  CHECK ("status" IN ('HADIR', 'TERLAMBAT', 'CUTI', 'SAKIT', 'IZIN'));
