-- Daily tasks: the units of work a PIC plans and reports on, sitting under the
-- project's daily report. Many tasks roll up into one DailyProjectReport.
CREATE TABLE IF NOT EXISTS "Task" (
    "id"             TEXT NOT NULL,
    "projectId"      TEXT NOT NULL,
    "entityId"       TEXT NOT NULL,
    "workDate"       TIMESTAMP(3) NOT NULL,
    "title"          TEXT NOT NULL,
    "description"    TEXT,
    "tags"           TEXT[] DEFAULT ARRAY[]::TEXT[],
    "picUserId"      TEXT,
    "picName"        TEXT,
    "startAt"        TIMESTAMP(3),
    "endAt"          TIMESTAMP(3),
    "durationMin"    INTEGER,
    "status"         TEXT NOT NULL DEFAULT 'BELUM_MULAI',
    "progressPct"    INTEGER NOT NULL DEFAULT 0,
    "obstacle"       TEXT,
    "decisionNeeded" TEXT,
    "escalationId"   TEXT,
    "createdById"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Subtask" (
    "id"        TEXT NOT NULL,
    "taskId"    TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "isDone"    BOOLEAN NOT NULL DEFAULT false,
    "position"  INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subtask_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey"    FOREIGN KEY ("projectId")    REFERENCES "Project"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_entityId_fkey"     FOREIGN KEY ("entityId")     REFERENCES "Entity"("id")     ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_picUserId_fkey"    FOREIGN KEY ("picUserId")    REFERENCES "User"("id")       ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey"  FOREIGN KEY ("createdById")  REFERENCES "User"("id")       ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_escalationId_fkey" FOREIGN KEY ("escalationId") REFERENCES "Escalation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Task_projectId_workDate_idx" ON "Task" ("projectId", "workDate");
CREATE INDEX IF NOT EXISTS "Task_entityId_workDate_idx"  ON "Task" ("entityId", "workDate");
CREATE INDEX IF NOT EXISTS "Task_picUserId_workDate_idx" ON "Task" ("picUserId", "workDate");
CREATE INDEX IF NOT EXISTS "Task_escalationId_idx"       ON "Task" ("escalationId");
CREATE INDEX IF NOT EXISTS "Task_createdById_idx"        ON "Task" ("createdById");
CREATE INDEX IF NOT EXISTS "Subtask_taskId_idx"          ON "Subtask" ("taskId");

ALTER TABLE "Task"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subtask" ENABLE ROW LEVEL SECURITY;
