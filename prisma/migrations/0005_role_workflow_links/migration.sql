-- Link projects to their PIC account and divisions to their head, so the
-- "PIC reports -> Admin PT forwards" chain can be enforced per account
-- instead of matching on a free-text name.
ALTER TABLE "Project"  ADD COLUMN IF NOT EXISTS "picUserId"  TEXT;
ALTER TABLE "Division" ADD COLUMN IF NOT EXISTS "headUserId" TEXT;

-- Hand-off timestamps: who passed the report up the chain, and when.
ALTER TABLE "DailyProjectReport"   ADD COLUMN IF NOT EXISTS "forwardedById" TEXT;
ALTER TABLE "DailyProjectReport"   ADD COLUMN IF NOT EXISTS "forwardedAt"   TIMESTAMP(3);
ALTER TABLE "WeeklyDivisionReport" ADD COLUMN IF NOT EXISTS "submittedById" TEXT;
ALTER TABLE "WeeklyDivisionReport" ADD COLUMN IF NOT EXISTS "submittedAt"   TIMESTAMP(3);
ALTER TABLE "WeeklyDivisionReport" ADD COLUMN IF NOT EXISTS "forwardedById" TEXT;
ALTER TABLE "WeeklyDivisionReport" ADD COLUMN IF NOT EXISTS "forwardedAt"   TIMESTAMP(3);

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_picUserId_fkey" FOREIGN KEY ("picUserId")
  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Division"
  ADD CONSTRAINT "Division_headUserId_fkey" FOREIGN KEY ("headUserId")
  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyProjectReport"
  ADD CONSTRAINT "DailyProjectReport_forwardedById_fkey" FOREIGN KEY ("forwardedById")
  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeeklyDivisionReport"
  ADD CONSTRAINT "WeeklyDivisionReport_submittedById_fkey" FOREIGN KEY ("submittedById")
  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeeklyDivisionReport"
  ADD CONSTRAINT "WeeklyDivisionReport_forwardedById_fkey" FOREIGN KEY ("forwardedById")
  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Project_picUserId_idx"                   ON "Project" ("picUserId");
CREATE INDEX IF NOT EXISTS "Division_headUserId_idx"                 ON "Division" ("headUserId");
CREATE INDEX IF NOT EXISTS "DailyProjectReport_forwardedById_idx"    ON "DailyProjectReport" ("forwardedById");
CREATE INDEX IF NOT EXISTS "WeeklyDivisionReport_submittedById_idx"  ON "WeeklyDivisionReport" ("submittedById");
CREATE INDEX IF NOT EXISTS "WeeklyDivisionReport_forwardedById_idx"  ON "WeeklyDivisionReport" ("forwardedById");
