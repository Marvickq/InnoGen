-- =============================================================
-- InnoGen — Full Schema Reset & Sync
-- Drops all existing tables and recreates from scratch
-- WARNING: Deletes all existing data
-- =============================================================

DROP TABLE IF EXISTS "AuditLog" CASCADE;
DROP TABLE IF EXISTS "VerificationReport" CASCADE;
DROP TABLE IF EXISTS "Citation" CASCADE;
DROP TABLE IF EXISTS "Contradiction" CASCADE;
DROP TABLE IF EXISTS "Claim" CASCADE;
DROP TABLE IF EXISTS "EvidenceItem" CASCADE;
DROP TABLE IF EXISTS "ResearchTask" CASCADE;
DROP TABLE IF EXISTS "ResearchJob" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;
DROP TABLE IF EXISTS "_prisma_migrations" CASCADE;

-- =============================================================
-- Recreate all tables matching current Prisma schema
-- =============================================================

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Researcher',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "query" TEXT NOT NULL,
    "depth" TEXT NOT NULL DEFAULT 'standard',
    "academicOnly" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "overallConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "hallucinationScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ResearchJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchTask" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResearchTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "taskId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "domainAuthorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNSUPPORTED',
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "explanation" TEXT,
    "evidenceIds" TEXT NOT NULL DEFAULT '[]',
    "supportStatus" TEXT,
    "supportConfidence" DOUBLE PRECISION,
    "quotedEvidence" TEXT,
    "reasoning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Citation" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "jobId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "supportsClaim" BOOLEAN NOT NULL DEFAULT true,
    "supportStatus" TEXT NOT NULL DEFAULT 'UNSUPPORTED',
    "supportConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "explanation" TEXT,
    "quotedEvidence" TEXT,
    "reasoning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Contradiction" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "sourceA" TEXT NOT NULL,
    "sourceB" TEXT NOT NULL,
    "isContradiction" BOOLEAN NOT NULL DEFAULT true,
    "differenceType" TEXT NOT NULL DEFAULT 'genuine contradiction',
    "contradictionConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "explanation" TEXT,
    "likelyReason" TEXT,
    "evidenceIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Contradiction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationReport" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "summaryMarkdown" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "auditTrailJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "agent" TEXT NOT NULL DEFAULT 'System',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- =============================================================
-- Indexes
-- =============================================================

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "VerificationReport_jobId_key" ON "VerificationReport"("jobId");

-- =============================================================
-- Foreign Keys
-- =============================================================

ALTER TABLE "ResearchJob" ADD CONSTRAINT "ResearchJob_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ResearchTask" ADD CONSTRAINT "ResearchTask_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "ResearchTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Claim" ADD CONSTRAINT "Claim_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Citation" ADD CONSTRAINT "Citation_claimId_fkey"
    FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Citation" ADD CONSTRAINT "Citation_evidenceId_fkey"
    FOREIGN KEY ("evidenceId") REFERENCES "EvidenceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Citation" ADD CONSTRAINT "Citation_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Contradiction" ADD CONSTRAINT "Contradiction_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VerificationReport" ADD CONSTRAINT "VerificationReport_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
