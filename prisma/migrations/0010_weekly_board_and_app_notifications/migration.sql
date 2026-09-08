-- 0010 — papan mingguan: task per hari yang bisa diseret-lepas, item divisi
-- per hari dengan tindak lanjut, dan notifikasi dalam aplikasi (8 Sep 2026).

-- Task: urutan kartu hasil seret-lepas, dan cakupan HARIAN / MINGGUAN.
ALTER TABLE "Task" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'HARIAN';

-- WeeklyReportItem: hari pengerjaan (null = capaian minggu), urutan, tindak lanjut.
ALTER TABLE "WeeklyReportItem" ADD COLUMN "workDate" TIMESTAMP(3);
ALTER TABLE "WeeklyReportItem" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WeeklyReportItem" ADD COLUMN "followUp" TEXT;
CREATE INDEX "WeeklyReportItem_weeklyReportId_workDate_idx" ON "WeeklyReportItem"("weeklyReportId", "workDate");

-- NotificationLog: kapan penerima membukanya di lonceng aplikasi.
ALTER TABLE "NotificationLog" ADD COLUMN "readAt" TIMESTAMP(3);
CREATE INDEX "NotificationLog_userId_readAt_idx" ON "NotificationLog"("userId", "readAt");
