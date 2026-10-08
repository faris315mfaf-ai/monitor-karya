-- 0021 — [F2-KADIV] ringkasan laporan mingguan untuk Direktur & tanda baca laporan harian (6 Okt 2026).
--
-- WeeklyDivisionSummary: satu baris per divisi per minggu ISO. Kepala divisi
-- menyusun draf otomatis (output diterima, proyek sesuai jadwal, kendala
-- terbuka, 3 poin) lalu "Kirim ke Direktur". Direktur membacanya bersama
-- laporan mingguan divisi lewat /api/ringkasan.
--
-- DailyReportRead: kepala divisi menandai laporan harian anggota sudah dibaca.
-- Laporan harian tetap dikirim langsung ke Admin PT.
--
-- Keduanya tanpa foreign key (pola WeeklyReportRead, 0017): cakupan dan
-- keberadaan baris dijaga di API, sehingga model milik area lain tidak berubah.

CREATE TABLE "WeeklyDivisionSummary" (
  "id"              TEXT NOT NULL,
  "divisionId"      TEXT NOT NULL,
  "isoYear"         INTEGER NOT NULL,
  "isoWeek"         INTEGER NOT NULL,
  "weeklyReportId"  TEXT,
  "status"          TEXT NOT NULL DEFAULT 'DRAF',
  "points"          TEXT[] DEFAULT ARRAY[]::TEXT[],
  "outputsAccepted" INTEGER NOT NULL DEFAULT 0,
  "outputsTarget"   INTEGER NOT NULL DEFAULT 0,
  "projectsOnTrack" INTEGER NOT NULL DEFAULT 0,
  "projectsTotal"   INTEGER NOT NULL DEFAULT 0,
  "openObstacles"   INTEGER NOT NULL DEFAULT 0,
  "pendingReview"   INTEGER NOT NULL DEFAULT 0,
  "sentAt"          TIMESTAMP(3),
  "sentById"        TEXT,
  "updatedById"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklyDivisionSummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WeeklyDivisionSummary_divisionId_isoYear_isoWeek_key" ON "WeeklyDivisionSummary"("divisionId", "isoYear", "isoWeek");
CREATE INDEX "WeeklyDivisionSummary_weeklyReportId_idx" ON "WeeklyDivisionSummary"("weeklyReportId");
ALTER TABLE "WeeklyDivisionSummary" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "DailyReportRead" (
  "id"            TEXT NOT NULL,
  "dailyReportId" TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "readAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyReportRead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyReportRead_dailyReportId_userId_key" ON "DailyReportRead"("dailyReportId", "userId");
CREATE INDEX "DailyReportRead_userId_idx" ON "DailyReportRead"("userId");
ALTER TABLE "DailyReportRead" ENABLE ROW LEVEL SECURITY;
