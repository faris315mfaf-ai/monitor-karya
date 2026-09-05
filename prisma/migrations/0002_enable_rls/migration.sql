-- Enable Row Level Security on every application table.
-- The app talks to the database through Prisma using the `postgres` role,
-- which bypasses RLS. Enabling RLS with no policies means the Supabase
-- Data API (anon / authenticated roles via PostgREST) cannot read or write
-- these tables — a safe default until real policies are designed.
ALTER TABLE "Entity"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DivisionType"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Division"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminAppointment"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AspectCategory"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Priority"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkCalendar"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Holiday"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyProjectReport"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WeeklyDivisionReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WeeklyReportItem"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Evidence"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Note"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Escalation"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UnlockRequest"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LateIncident"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpotCheck"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationLog"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KpiSnapshot"          ENABLE ROW LEVEL SECURITY;

-- Helpful indexes for the query patterns used by the API routes.
CREATE INDEX IF NOT EXISTS "Entity_path_idx"                 ON "Entity" ("path");
CREATE INDEX IF NOT EXISTS "Entity_parentId_idx"             ON "Entity" ("parentId");
CREATE INDEX IF NOT EXISTS "DailyProjectReport_entity_date"  ON "DailyProjectReport" ("entityId", "reportDate");
CREATE INDEX IF NOT EXISTS "DailyProjectReport_reportDate"   ON "DailyProjectReport" ("reportDate");
CREATE INDEX IF NOT EXISTS "WeeklyDivisionReport_entity"     ON "WeeklyDivisionReport" ("entityId", "isoYear", "isoWeek");
CREATE INDEX IF NOT EXISTS "WeeklyReportItem_report"         ON "WeeklyReportItem" ("weeklyReportId");
CREATE INDEX IF NOT EXISTS "Escalation_status_raisedAt"      ON "Escalation" ("status", "raisedAt");
CREATE INDEX IF NOT EXISTS "Escalation_entityId"             ON "Escalation" ("entityId");
CREATE INDEX IF NOT EXISTS "KpiSnapshot_period"              ON "KpiSnapshot" ("periodType", "periodKey");
CREATE INDEX IF NOT EXISTS "AuditLog_at"                     ON "AuditLog" ("at");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId"                ON "AuditLog" ("actorId");
CREATE INDEX IF NOT EXISTS "NotificationLog_createdAt"       ON "NotificationLog" ("createdAt");
CREATE INDEX IF NOT EXISTS "LateIncident_entityId"           ON "LateIncident" ("entityId");
CREATE INDEX IF NOT EXISTS "User_role_scope"                 ON "User" ("role", "scopeEntityId");
CREATE INDEX IF NOT EXISTS "Project_entityId"                ON "Project" ("entityId");
CREATE INDEX IF NOT EXISTS "Division_entityId"               ON "Division" ("entityId");
