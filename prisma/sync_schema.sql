-- =============================================================
-- InnoGen — PostgreSQL Schema Synchronization Script v2
-- Pass 1: Create missing tables + add missing columns
-- Pass 2: Add all foreign keys and indexes
-- Safe to run multiple times.
-- =============================================================

BEGIN;

-- =============================================================
-- PASS 1: TABLES (if not exist)
-- =============================================================

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Researcher',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ResearchJob" (
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

CREATE TABLE IF NOT EXISTS "ResearchTask" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResearchTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EvidenceItem" (
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

CREATE TABLE IF NOT EXISTS "Claim" (
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

CREATE TABLE IF NOT EXISTS "Citation" (
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

CREATE TABLE IF NOT EXISTS "Contradiction" (
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

CREATE TABLE IF NOT EXISTS "VerificationReport" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "summaryMarkdown" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "auditTrailJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "agent" TEXT NOT NULL DEFAULT 'System',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- =============================================================
-- PASS 2: ENSURE ALL COLUMNS EXIST ON EVERY TABLE
-- (Safe to run — each block checks information_schema first)
-- =============================================================

-- User
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='id') THEN ALTER TABLE "User" ADD COLUMN "id" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='email') THEN ALTER TABLE "User" ADD COLUMN "email" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='name') THEN ALTER TABLE "User" ADD COLUMN "name" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='role') THEN ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'Researcher'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='createdAt') THEN ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; END IF; END $$;

-- ResearchJob
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchJob' AND column_name='id') THEN ALTER TABLE "ResearchJob" ADD COLUMN "id" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchJob' AND column_name='userId') THEN ALTER TABLE "ResearchJob" ADD COLUMN "userId" TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchJob' AND column_name='query') THEN ALTER TABLE "ResearchJob" ADD COLUMN "query" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchJob' AND column_name='depth') THEN ALTER TABLE "ResearchJob" ADD COLUMN "depth" TEXT NOT NULL DEFAULT 'standard'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchJob' AND column_name='academicOnly') THEN ALTER TABLE "ResearchJob" ADD COLUMN "academicOnly" BOOLEAN NOT NULL DEFAULT false; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchJob' AND column_name='status') THEN ALTER TABLE "ResearchJob" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchJob' AND column_name='overallConfidence') THEN ALTER TABLE "ResearchJob" ADD COLUMN "overallConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchJob' AND column_name='hallucinationScore') THEN ALTER TABLE "ResearchJob" ADD COLUMN "hallucinationScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchJob' AND column_name='createdAt') THEN ALTER TABLE "ResearchJob" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchJob' AND column_name='completedAt') THEN ALTER TABLE "ResearchJob" ADD COLUMN "completedAt" TIMESTAMP(3); END IF; END $$;

-- ResearchTask
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchTask' AND column_name='id') THEN ALTER TABLE "ResearchTask" ADD COLUMN "id" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchTask' AND column_name='jobId') THEN ALTER TABLE "ResearchTask" ADD COLUMN "jobId" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchTask' AND column_name='objective') THEN ALTER TABLE "ResearchTask" ADD COLUMN "objective" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchTask' AND column_name='status') THEN ALTER TABLE "ResearchTask" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ResearchTask' AND column_name='createdAt') THEN ALTER TABLE "ResearchTask" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; END IF; END $$;

-- EvidenceItem
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='EvidenceItem' AND column_name='id') THEN ALTER TABLE "EvidenceItem" ADD COLUMN "id" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='EvidenceItem' AND column_name='jobId') THEN ALTER TABLE "EvidenceItem" ADD COLUMN "jobId" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='EvidenceItem' AND column_name='taskId') THEN ALTER TABLE "EvidenceItem" ADD COLUMN "taskId" TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='EvidenceItem' AND column_name='sourceUrl') THEN ALTER TABLE "EvidenceItem" ADD COLUMN "sourceUrl" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='EvidenceItem' AND column_name='sourceTitle') THEN ALTER TABLE "EvidenceItem" ADD COLUMN "sourceTitle" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='EvidenceItem' AND column_name='publisher') THEN ALTER TABLE "EvidenceItem" ADD COLUMN "publisher" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='EvidenceItem' AND column_name='snippet') THEN ALTER TABLE "EvidenceItem" ADD COLUMN "snippet" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='EvidenceItem' AND column_name='domainAuthorityScore') THEN ALTER TABLE "EvidenceItem" ADD COLUMN "domainAuthorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0.85; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='EvidenceItem' AND column_name='createdAt') THEN ALTER TABLE "EvidenceItem" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; END IF; END $$;

-- Claim
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Claim' AND column_name='id') THEN ALTER TABLE "Claim" ADD COLUMN "id" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Claim' AND column_name='jobId') THEN ALTER TABLE "Claim" ADD COLUMN "jobId" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Claim' AND column_name='claimText') THEN ALTER TABLE "Claim" ADD COLUMN "claimText" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Claim' AND column_name='status') THEN ALTER TABLE "Claim" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'UNSUPPORTED'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Claim' AND column_name='confidenceScore') THEN ALTER TABLE "Claim" ADD COLUMN "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Claim' AND column_name='explanation') THEN ALTER TABLE "Claim" ADD COLUMN "explanation" TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Claim' AND column_name='evidenceIds') THEN ALTER TABLE "Claim" ADD COLUMN "evidenceIds" TEXT NOT NULL DEFAULT '[]'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Claim' AND column_name='supportStatus') THEN ALTER TABLE "Claim" ADD COLUMN "supportStatus" TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Claim' AND column_name='supportConfidence') THEN ALTER TABLE "Claim" ADD COLUMN "supportConfidence" DOUBLE PRECISION; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Claim' AND column_name='quotedEvidence') THEN ALTER TABLE "Claim" ADD COLUMN "quotedEvidence" TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Claim' AND column_name='reasoning') THEN ALTER TABLE "Claim" ADD COLUMN "reasoning" TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Claim' AND column_name='createdAt') THEN ALTER TABLE "Claim" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; END IF; END $$;

-- Citation
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='id') THEN ALTER TABLE "Citation" ADD COLUMN "id" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='claimId') THEN ALTER TABLE "Citation" ADD COLUMN "claimId" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='evidenceId') THEN ALTER TABLE "Citation" ADD COLUMN "evidenceId" TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='jobId') THEN ALTER TABLE "Citation" ADD COLUMN "jobId" TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='url') THEN ALTER TABLE "Citation" ADD COLUMN "url" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='title') THEN ALTER TABLE "Citation" ADD COLUMN "title" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='publisher') THEN ALTER TABLE "Citation" ADD COLUMN "publisher" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='isValid') THEN ALTER TABLE "Citation" ADD COLUMN "isValid" BOOLEAN NOT NULL DEFAULT true; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='supportsClaim') THEN ALTER TABLE "Citation" ADD COLUMN "supportsClaim" BOOLEAN NOT NULL DEFAULT true; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='supportStatus') THEN ALTER TABLE "Citation" ADD COLUMN "supportStatus" TEXT NOT NULL DEFAULT 'UNSUPPORTED'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='supportConfidence') THEN ALTER TABLE "Citation" ADD COLUMN "supportConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='explanation') THEN ALTER TABLE "Citation" ADD COLUMN "explanation" TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='quotedEvidence') THEN ALTER TABLE "Citation" ADD COLUMN "quotedEvidence" TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='reasoning') THEN ALTER TABLE "Citation" ADD COLUMN "reasoning" TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Citation' AND column_name='createdAt') THEN ALTER TABLE "Citation" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; END IF; END $$;

-- Contradiction
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Contradiction' AND column_name='id') THEN ALTER TABLE "Contradiction" ADD COLUMN "id" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Contradiction' AND column_name='jobId') THEN ALTER TABLE "Contradiction" ADD COLUMN "jobId" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Contradiction' AND column_name='claimText') THEN ALTER TABLE "Contradiction" ADD COLUMN "claimText" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Contradiction' AND column_name='sourceA') THEN ALTER TABLE "Contradiction" ADD COLUMN "sourceA" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Contradiction' AND column_name='sourceB') THEN ALTER TABLE "Contradiction" ADD COLUMN "sourceB" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Contradiction' AND column_name='isContradiction') THEN ALTER TABLE "Contradiction" ADD COLUMN "isContradiction" BOOLEAN NOT NULL DEFAULT true; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Contradiction' AND column_name='differenceType') THEN ALTER TABLE "Contradiction" ADD COLUMN "differenceType" TEXT NOT NULL DEFAULT 'genuine contradiction'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Contradiction' AND column_name='contradictionConfidence') THEN ALTER TABLE "Contradiction" ADD COLUMN "contradictionConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Contradiction' AND column_name='explanation') THEN ALTER TABLE "Contradiction" ADD COLUMN "explanation" TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Contradiction' AND column_name='likelyReason') THEN ALTER TABLE "Contradiction" ADD COLUMN "likelyReason" TEXT; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Contradiction' AND column_name='evidenceIds') THEN ALTER TABLE "Contradiction" ADD COLUMN "evidenceIds" TEXT NOT NULL DEFAULT '[]'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Contradiction' AND column_name='createdAt') THEN ALTER TABLE "Contradiction" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; END IF; END $$;

-- VerificationReport
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VerificationReport' AND column_name='id') THEN ALTER TABLE "VerificationReport" ADD COLUMN "id" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VerificationReport' AND column_name='jobId') THEN ALTER TABLE "VerificationReport" ADD COLUMN "jobId" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VerificationReport' AND column_name='summaryMarkdown') THEN ALTER TABLE "VerificationReport" ADD COLUMN "summaryMarkdown" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VerificationReport' AND column_name='confidenceScore') THEN ALTER TABLE "VerificationReport" ADD COLUMN "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VerificationReport' AND column_name='auditTrailJson') THEN ALTER TABLE "VerificationReport" ADD COLUMN "auditTrailJson" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VerificationReport' AND column_name='createdAt') THEN ALTER TABLE "VerificationReport" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; END IF; END $$;

-- AuditLog
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='AuditLog' AND column_name='id') THEN ALTER TABLE "AuditLog" ADD COLUMN "id" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='AuditLog' AND column_name='action') THEN ALTER TABLE "AuditLog" ADD COLUMN "action" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='AuditLog' AND column_name='details') THEN ALTER TABLE "AuditLog" ADD COLUMN "details" TEXT NOT NULL DEFAULT ''; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='AuditLog' AND column_name='agent') THEN ALTER TABLE "AuditLog" ADD COLUMN "agent" TEXT NOT NULL DEFAULT 'System'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='AuditLog' AND column_name='timestamp') THEN ALTER TABLE "AuditLog" ADD COLUMN "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; END IF; END $$;

-- =============================================================
-- PASS 3: INDEXES
-- =============================================================

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationReport_jobId_key" ON "VerificationReport"("jobId");

-- =============================================================
-- PASS 4: FOREIGN KEYS (columns now guaranteed to exist)
-- =============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResearchJob_userId_fkey') THEN
    ALTER TABLE "ResearchJob" ADD CONSTRAINT "ResearchJob_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResearchTask_jobId_fkey') THEN
    ALTER TABLE "ResearchTask" ADD CONSTRAINT "ResearchTask_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvidenceItem_jobId_fkey') THEN
    ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EvidenceItem_taskId_fkey') THEN
    ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "ResearchTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Claim_jobId_fkey') THEN
    ALTER TABLE "Claim" ADD CONSTRAINT "Claim_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Citation_claimId_fkey') THEN
    ALTER TABLE "Citation" ADD CONSTRAINT "Citation_claimId_fkey"
      FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Citation_evidenceId_fkey') THEN
    ALTER TABLE "Citation" ADD CONSTRAINT "Citation_evidenceId_fkey"
      FOREIGN KEY ("evidenceId") REFERENCES "EvidenceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Citation_jobId_fkey') THEN
    ALTER TABLE "Citation" ADD CONSTRAINT "Citation_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Contradiction_jobId_fkey') THEN
    ALTER TABLE "Contradiction" ADD CONSTRAINT "Contradiction_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VerificationReport_jobId_fkey') THEN
    ALTER TABLE "VerificationReport" ADD CONSTRAINT "VerificationReport_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
