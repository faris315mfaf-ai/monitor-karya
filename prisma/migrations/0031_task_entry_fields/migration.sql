-- 0031 — entri laporan multi-item (10 Okt 2026): PIC melaporkan beberapa entri
-- per hari, jadi task membawa narasi pengerjaannya sendiri (achievementToday),
-- rencana besok (followUp), dan tanda perlu eskalasi/keputusan
-- (needsEscalation). Kolom lama tidak berubah; roll-up menggabungkannya ke
-- DailyProjectReport.

ALTER TABLE "Task" ADD COLUMN "achievementToday" TEXT;
ALTER TABLE "Task" ADD COLUMN "followUp" TEXT;
ALTER TABLE "Task" ADD COLUMN "needsEscalation" BOOLEAN NOT NULL DEFAULT false;
