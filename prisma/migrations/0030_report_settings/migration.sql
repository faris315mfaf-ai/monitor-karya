-- Pengaturan aturan pelaporan per entitas (10 Okt 2026)
CREATE TABLE "ReportSettings" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "dailyCutoffHour" INTEGER,
    "workingDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "dailyOpen" BOOLEAN NOT NULL DEFAULT true,
    "weeklyCutoffHour" INTEGER,
    "weeklyOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSettings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportSettings_entityId_idx" ON "ReportSettings"("entityId");
CREATE UNIQUE INDEX "ReportSettings_entityId_key" ON "ReportSettings"("entityId");
ALTER TABLE "ReportSettings" ADD CONSTRAINT "ReportSettings_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
