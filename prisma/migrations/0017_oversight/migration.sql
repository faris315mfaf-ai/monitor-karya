-- 0017 — tanda "Sudah dibaca" laporan mingguan divisi oleh pengawas (6 Okt 2026).
-- Dipakai layar Direktur (docs/design/peran/02-direktur.md). Tanpa kunci asing,
-- sama dengan model Prisma yang tidak memakai relasi; keberadaan laporan dan
-- cakupan pembaca diperiksa di /api/ringkasan/laporan-dibaca.

CREATE TABLE "WeeklyReportRead" (
  "id"             TEXT NOT NULL,
  "weeklyReportId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "readAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyReportRead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WeeklyReportRead_weeklyReportId_userId_key" ON "WeeklyReportRead"("weeklyReportId", "userId");
CREATE INDEX "WeeklyReportRead_userId_idx" ON "WeeklyReportRead"("userId");
ALTER TABLE "WeeklyReportRead" ENABLE ROW LEVEL SECURITY;
