-- 0015 — fitur kepala divisi: anggota divisi, divisi proyek, kehadiran (6 Okt 2026).

-- Anggota divisi: satu orang satu divisi; nullable karena data lama tidak
-- bisa dipetakan otomatis. Kepala divisi tetap lewat "Division"."headUserId".
ALTER TABLE "User" ADD COLUMN "divisionId" TEXT;
CREATE INDEX "User_divisionId_idx" ON "User"("divisionId");
ALTER TABLE "User" ADD CONSTRAINT "User_divisionId_fkey"
  FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Divisi pelaksana proyek: satu proyek satu divisi; nullable (data lama
-- diturunkan dari divisi PIC sampai Admin PT / kepala divisi mengisinya).
ALTER TABLE "Project" ADD COLUMN "divisionId" TEXT;
CREATE INDEX "Project_divisionId_idx" ON "Project"("divisionId");
ALTER TABLE "Project" ADD CONSTRAINT "Project_divisionId_fkey"
  FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Kehadiran harian: hari tanpa baris dianggap HADIR.
CREATE TABLE "Attendance" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "date"         TIMESTAMP(3) NOT NULL,
  "status"       TEXT NOT NULL,
  "note"         TEXT,
  "recordedById" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Attendance_userId_date_key" ON "Attendance"("userId", "date");
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");
CREATE INDEX "Attendance_recordedById_idx" ON "Attendance"("recordedById");
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_status_check"
  CHECK ("status" IN ('HADIR', 'CUTI', 'SAKIT', 'IZIN'));
ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;
