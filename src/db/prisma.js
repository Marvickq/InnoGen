import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

function serializeArray(arr) {
  return JSON.stringify(arr || []);
}

function deserializeArray(str) {
  if (!str) return [];
  if (Array.isArray(str)) return str;
  try { return JSON.parse(str); } catch { return []; }
}

export const db = {
  job: {
    async create(data) {
      const job = await prisma.researchJob.create({
        data: {
          id: `job-${Date.now()}`,
          query: data.query,
          depth: data.depth || 'standard',
          academicOnly: !!data.academicOnly,
          status: 'PROCESSING',
          overallConfidence: 0.0,
          hallucinationScore: 0.0,
          createdAt: new Date(),
          completedAt: null
        }
      });
      return {
        ...job,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString?.() || null
      };
    },
    async update(id, updates) {
      const data = {};
      if (updates.status !== undefined) data.status = updates.status;
      if (updates.overallConfidence !== undefined) data.overallConfidence = updates.overallConfidence;
      if (updates.hallucinationScore !== undefined) data.hallucinationScore = updates.hallucinationScore;
      if (updates.completedAt !== undefined) data.completedAt = new Date(updates.completedAt);
      const job = await prisma.researchJob.update({ where: { id }, data });
      return {
        ...job,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString?.() || null
      };
    },
    async findById(id) {
      const job = await prisma.researchJob.findUnique({
        where: { id },
        include: {
          tasks: true,
          evidenceItems: true,
          claims: true,
          contradictions: true,
          citations: true,
          report: true
        }
      });
      if (!job) return null;
      const serialized = {
        ...job,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString?.() || null,
        tasks: job.tasks.map(t => ({ ...t, createdAt: t.createdAt.toISOString() })),
        evidenceItems: job.evidenceItems.map(e => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
          authorityScore: e.domainAuthorityScore ? +(e.domainAuthorityScore * 100).toFixed(0) : 0,
          domainAuthorityScore: undefined
        })),
        claims: job.claims.map(c => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          evidenceIds: deserializeArray(c.evidenceIds)
        })),
        contradictions: job.contradictions.map(c => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          evidenceIds: deserializeArray(c.evidenceIds),
          textA: c.sourceA,
          textB: c.sourceB,
          publisherA: c.sourceA ? c.sourceA.split(':')[0] : '',
          publisherB: c.sourceB ? c.sourceB.split(':')[0] : ''
        })),
        citations: job.citations.map(c => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          sourceTitle: c.title
        })),
        report: job.report ? {
          ...job.report,
          createdAt: job.report.createdAt.toISOString()
        } : null
      };
      return serialized;
    },
    async findByStatus(status) {
      const jobs = await prisma.researchJob.findMany({
        where: { status },
        orderBy: { createdAt: 'asc' },
        include: {
          _count: { select: { evidenceItems: true, claims: true, contradictions: true } }
        }
      });
      return jobs.map(j => ({
        id: j.id,
        userId: j.userId,
        query: j.query,
        depth: j.depth,
        academicOnly: j.academicOnly,
        status: j.status,
        overallConfidence: j.overallConfidence,
        hallucinationScore: j.hallucinationScore,
        createdAt: j.createdAt.toISOString(),
        completedAt: j.completedAt?.toISOString?.() || null,
        _count: j._count
      }));
    },
    async findMany() {
      const jobs = await prisma.researchJob.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { evidenceItems: true, claims: true, contradictions: true } }
        }
      });
      return jobs.map(j => ({
        id: j.id,
        userId: j.userId,
        query: j.query,
        depth: j.depth,
        academicOnly: j.academicOnly,
        status: j.status,
        overallConfidence: j.overallConfidence,
        hallucinationScore: j.hallucinationScore,
        createdAt: j.createdAt.toISOString(),
        completedAt: j.completedAt?.toISOString?.() || null,
        _count: j._count
      }));
    }
  },
  task: {
    async createMany(jobId, objectives) {
      const tasks = await Promise.all(
        objectives.map((obj, i) =>
          prisma.researchTask.create({
            data: {
              id: `task-${Date.now()}-${i}`,
              jobId,
              objective: obj,
              status: 'PENDING',
              createdAt: new Date()
            }
          })
        )
      );
      return tasks.map(t => ({ ...t, createdAt: t.createdAt.toISOString() }));
    }
  },
  evidence: {
    async create(item) {
      const ev = await prisma.evidenceItem.create({
        data: {
          id: item.id || `ev-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          jobId: item.jobId,
          taskId: item.taskId || null,
          sourceUrl: item.sourceUrl,
          sourceTitle: item.sourceTitle,
          publisher: item.publisher || 'Web Reference',
          snippet: item.snippet,
          domainAuthorityScore: item.domainAuthorityScore || 0.85,
          createdAt: new Date()
        }
      });
      return { ...ev, createdAt: ev.createdAt.toISOString() };
    }
  },
  claim: {
    async create(claim) {
      const c = await prisma.claim.create({
        data: {
          id: `claim-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          jobId: claim.jobId,
          claimText: claim.claimText,
          status: claim.status || 'UNSUPPORTED',
          confidenceScore: claim.confidenceScore || 0.0,
          explanation: claim.explanation || '',
          evidenceIds: serializeArray(claim.evidenceIds || [])
        }
      });
      return {
        ...c,
        createdAt: c.createdAt.toISOString(),
        evidenceIds: deserializeArray(c.evidenceIds)
      };
    },
    async update(id, updates) {
      const data = {};
      if (updates.status !== undefined) data.status = updates.status;
      if (updates.confidenceScore !== undefined) data.confidenceScore = updates.confidenceScore;
      if (updates.explanation !== undefined) data.explanation = updates.explanation;
      if (updates.evidenceIds !== undefined) data.evidenceIds = serializeArray(updates.evidenceIds);
      if (updates.supportStatus !== undefined) data.supportStatus = updates.supportStatus;
      if (updates.supportConfidence !== undefined) data.supportConfidence = updates.supportConfidence;
      if (updates.quotedEvidence !== undefined) data.quotedEvidence = updates.quotedEvidence;
      if (updates.reasoning !== undefined) data.reasoning = updates.reasoning;
      const c = await prisma.claim.update({ where: { id }, data });
      return {
        ...c,
        createdAt: c.createdAt.toISOString(),
        evidenceIds: deserializeArray(c.evidenceIds)
      };
    }
  },
  citation: {
    async create(cit) {
      const c = await prisma.citation.create({
        data: {
          id: `cit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          claimId: cit.claimId,
          evidenceId: cit.evidenceId || null,
          jobId: cit.jobId || null,
          url: cit.url,
          title: cit.title,
          publisher: cit.publisher || 'Publisher',
          isValid: cit.isValid !== undefined ? cit.isValid : true,
          supportsClaim: cit.supportsClaim !== undefined ? cit.supportsClaim : true,
          supportStatus: cit.supportStatus || 'UNSUPPORTED',
          supportConfidence: cit.supportConfidence || 0.0,
          explanation: cit.explanation || '',
          quotedEvidence: cit.quotedEvidence || '',
          reasoning: cit.reasoning || '',
          createdAt: new Date()
        }
      });
      return { ...c, createdAt: c.createdAt.toISOString() };
    }
  },
  contradiction: {
    async create(con) {
      const c = await prisma.contradiction.create({
        data: {
          id: `con-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          jobId: con.jobId,
          claimText: con.claimText,
          sourceA: con.sourceA,
          sourceB: con.sourceB,
          isContradiction: con.isContradiction !== undefined ? con.isContradiction : true,
          differenceType: con.differenceType || 'genuine contradiction',
          contradictionConfidence: con.contradictionConfidence || 0.0,
          explanation: con.explanation || '',
          likelyReason: con.likelyReason || '',
          evidenceIds: serializeArray(con.evidenceIds || [])
        }
      });
      return {
        ...c,
        createdAt: c.createdAt.toISOString(),
        evidenceIds: deserializeArray(c.evidenceIds)
      };
    }
  },
  report: {
    async create(rep) {
      const r = await prisma.verificationReport.create({
        data: {
          id: `rep-${Date.now()}`,
          jobId: rep.jobId,
          summaryMarkdown: rep.summaryMarkdown,
          confidenceScore: rep.confidenceScore,
          auditTrailJson: typeof rep.auditTrail === 'string' ? rep.auditTrail : JSON.stringify(rep.auditTrail),
          createdAt: new Date()
        }
      });
      return { ...r, createdAt: r.createdAt.toISOString() };
    }
  },
  auditLog: {
    async create(log) {
      const l = await prisma.auditLog.create({
        data: {
          id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          action: log.action,
          details: log.details,
          agent: log.agent || 'System',
          timestamp: new Date()
        }
      });
      return { ...l, timestamp: l.timestamp.toISOString() };
    },
    async findMany() {
      const logs = await prisma.auditLog.findMany({ orderBy: { timestamp: 'desc' } });
      return logs.map(l => ({ ...l, timestamp: l.timestamp.toISOString() }));
    }
  }
};
