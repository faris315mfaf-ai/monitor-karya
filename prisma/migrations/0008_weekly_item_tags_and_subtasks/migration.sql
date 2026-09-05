-- Weekly division items gain the same detail a daily task has: free-form tags
-- and a checklist. Subtask becomes shared between the two owners, with exactly
-- one of taskId / weeklyItemId set.
ALTER TABLE "WeeklyReportItem" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Subtask" ADD COLUMN IF NOT EXISTS "weeklyItemId" TEXT;
ALTER TABLE "Subtask" ALTER COLUMN "taskId" DROP NOT NULL;

ALTER TABLE "Subtask"
  ADD CONSTRAINT "Subtask_weeklyItemId_fkey" FOREIGN KEY ("weeklyItemId")
  REFERENCES "WeeklyReportItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Subtask_weeklyItemId_idx" ON "Subtask" ("weeklyItemId");

ALTER TABLE "Subtask"
  ADD CONSTRAINT "Subtask_one_owner"
  CHECK (("taskId" IS NOT NULL) <> ("weeklyItemId" IS NOT NULL));
