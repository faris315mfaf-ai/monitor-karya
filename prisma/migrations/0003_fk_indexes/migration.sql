-- Covering indexes for foreign keys flagged by the Supabase performance advisor.
CREATE INDEX IF NOT EXISTS "AdminAppointment_entityId_idx"        ON "AdminAppointment" ("entityId");
CREATE INDEX IF NOT EXISTS "DailyProjectReport_submittedById_idx" ON "DailyProjectReport" ("submittedById");
CREATE INDEX IF NOT EXISTS "Division_divisionTypeId_idx"          ON "Division" ("divisionTypeId");
CREATE INDEX IF NOT EXISTS "Escalation_decidedById_idx"           ON "Escalation" ("decidedById");
CREATE INDEX IF NOT EXISTS "Escalation_raisedById_idx"            ON "Escalation" ("raisedById");
CREATE INDEX IF NOT EXISTS "Holiday_workCalendarId_idx"           ON "Holiday" ("workCalendarId");
CREATE INDEX IF NOT EXISTS "NotificationLog_userId_idx"           ON "NotificationLog" ("userId");
CREATE INDEX IF NOT EXISTS "SpotCheck_checkedById_idx"            ON "SpotCheck" ("checkedById");
CREATE INDEX IF NOT EXISTS "UnlockRequest_approvedById_idx"       ON "UnlockRequest" ("approvedById");
CREATE INDEX IF NOT EXISTS "UnlockRequest_executedById_idx"       ON "UnlockRequest" ("executedById");
CREATE INDEX IF NOT EXISTS "UnlockRequest_requestedById_idx"      ON "UnlockRequest" ("requestedById");
CREATE INDEX IF NOT EXISTS "WeeklyDivisionReport_approvedById_idx" ON "WeeklyDivisionReport" ("approvedById");
CREATE INDEX IF NOT EXISTS "WeeklyReportItem_aspectCategoryId_idx" ON "WeeklyReportItem" ("aspectCategoryId");
CREATE INDEX IF NOT EXISTS "WeeklyReportItem_priorityId_idx"      ON "WeeklyReportItem" ("priorityId");
