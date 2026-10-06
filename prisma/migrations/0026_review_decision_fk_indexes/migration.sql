-- CX13: indeks FK untuk pencarian reviewer dan pemutus.
-- Additive saja: indeks manual dari migrasi lama sengaja dipertahankan.
CREATE INDEX IF NOT EXISTS "Output_reviewerId_idx" ON "Output"("reviewerId");
CREATE INDEX IF NOT EXISTS "DeadlineProposal_decidedById_idx" ON "DeadlineProposal"("decidedById");
CREATE INDEX IF NOT EXISTS "AccessRequest_decidedById_idx" ON "AccessRequest"("decidedById");
