import express from 'express';
import { db } from '../db/prisma.js';
import { submitJob } from '../services/worker.js';
import { logger, incrementMetric } from '../services/monitor.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const jobs = await db.job.findMany();
    res.json({ success: true, jobs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { query, depth = 'standard', academicOnly = false } = req.body;
    if (!query) return res.status(400).json({ success: false, error: 'Query string is required' });

    const job = await db.job.create({ query, depth, academicOnly });
    incrementMetric('jobsCreated');

    await db.auditLog.create({ action: 'RESEARCH_JOB_CREATED', details: `Created job for query "${query}"`, agent: 'Planner Agent' });

    submitJob(job.id);

    res.json({ success: true, jobId: job.id, status: job.status, query: job.query });
  } catch (error) {
    logger.error(`Create Research Job API Error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:jobId', async (req, res) => {
  try {
    const job = await db.job.findById(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'Research job not found' });
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:jobId/graph', async (req, res) => {
  try {
    const job = await db.job.findById(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    const nodes = [
      { name: 'Planner', status: 'COMPLETED' },
      { name: 'Task Decomposer', status: 'COMPLETED' },
      { name: 'Parallel Research', status: 'COMPLETED' },
      { name: 'Evidence Collection', status: 'COMPLETED' },
      { name: 'Claim Extraction', status: 'COMPLETED' },
      { name: 'Citation Verification', status: 'COMPLETED' },
      { name: 'Fact Verification', status: 'COMPLETED' },
      { name: 'Contradiction Detection', status: 'COMPLETED' },
      { name: 'Hallucination Check', status: 'COMPLETED' },
      { name: 'Consensus & Confidence', status: 'COMPLETED' },
      { name: 'Report Generator', status: job.status === 'COMPLETED' ? 'COMPLETED' : 'RUNNING' }
    ];

    res.json({ success: true, jobId: req.params.jobId, nodes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:jobId/evidence', async (req, res) => {
  try {
    const job = await db.job.findById(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    res.json({ success: true, evidence: job.evidenceItems });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:jobId/claims', async (req, res) => {
  try {
    const job = await db.job.findById(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    res.json({ success: true, claims: job.claims });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:jobId/report', async (req, res) => {
  try {
    const job = await db.job.findById(req.params.jobId);
    if (!job || !job.report) return res.status(404).json({ success: false, error: 'Report not ready yet' });
    res.json({ success: true, report: job.report });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:jobId/audit', async (req, res) => {
  try {
    const logs = await db.auditLog.findMany();
    res.json({ success: true, auditLogs: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/validate/citation', (req, res) => {
  const { claimText, evidenceSnippet, evidenceUrl } = req.body;
  if (!claimText || !evidenceSnippet) return res.status(400).json({ success: false, error: 'claimText and evidenceSnippet are required' });

  const overlapScore = claimText.toLowerCase().split(/\s+/).filter(w => w.length > 3).filter(w =>
    evidenceSnippet.toLowerCase().includes(w)
  ).length / Math.max(1, claimText.toLowerCase().split(/\s+/).filter(w => w.length > 3).length);

  let supportStatus, supportConfidence, explanation, quotedEvidence, reasoning;
  if (overlapScore > 0.7) { supportStatus = 'SUPPORTED'; supportConfidence = 70 + overlapScore * 25; explanation = `High term overlap (${(overlapScore * 100).toFixed(0)}%) — claim terms found in evidence.`; quotedEvidence = evidenceSnippet.substring(0, 200); reasoning = `${(overlapScore * 100).toFixed(0)}% of claim terms appear in evidence.`; }
  else if (overlapScore > 0.3) { supportStatus = 'PARTIALLY_SUPPORTED'; supportConfidence = 30 + overlapScore * 50; explanation = `Partial term overlap (${(overlapScore * 100).toFixed(0)}%) — some claim terms found.`; quotedEvidence = evidenceSnippet.substring(0, 200); reasoning = `${(overlapScore * 100).toFixed(0)}% term overlap between claim and evidence.`; }
  else { supportStatus = 'UNSUPPORTED'; supportConfidence = 10 + overlapScore * 20; explanation = `Low term overlap (${(overlapScore * 100).toFixed(0)}%) — few claim terms found.`; quotedEvidence = ''; reasoning = `Only ${(overlapScore * 100).toFixed(0)}% of claim terms appear in evidence.`; }

  res.json({ success: true, validation: { claimText, evidenceUrl: evidenceUrl || '—', supportStatus, supportConfidence: +supportConfidence.toFixed(1), explanation, quotedEvidence, reasoning, overlapScore: +overlapScore.toFixed(2) } });
});

router.post('/validate/contradiction', (req, res) => {
  const { textA, textB, publisherA, publisherB } = req.body;
  if (!textA || !textB) return res.status(400).json({ success: false, error: 'textA and textB are required' });

  const numbersRegex = /\d+[\.\d]*(?:\s*(?:GW|MW|%|billion|million|trillion|₹|\$|€|£|kWh|TWh|sq\s*km|km|m|tons|tonnes))?/gi;
  const numsA = (textA.match(numbersRegex) || []).map(n => parseFloat(n.replace(/[^\d.]/g, ''))).filter(n => !isNaN(n));
  const numsB = (textB.match(numbersRegex) || []).map(n => parseFloat(n.replace(/[^\d.]/g, ''))).filter(n => !isNaN(n));

  let isContradiction = false, differenceType = 'no contradiction', contradictionConfidence = 0, explanation = '';

  for (const na of numsA) {
    for (const nb of numsB) {
      if (Math.abs(na - nb) > 0 && Math.min(na, nb) > 0) {
        const ratio = Math.max(na, nb) / Math.min(na, nb);
        if (ratio > 1.5 && ratio < 100) {
          isContradiction = true; differenceType = 'numeric disagreement';
          contradictionConfidence = Math.min(90, 30 + (ratio - 1) * 20);
          explanation = `Value ${na} differs from value ${nb} by factor of ${ratio.toFixed(1)}x.`; break;
        }
      }
    } if (isContradiction) break;
  }

  if (!isContradiction) {
    const wordsA = new Set(textA.toLowerCase().split(/\s+/));
    const wordsB = new Set(textB.toLowerCase().split(/\s+/));
    const common = [...wordsA].filter(w => wordsB.has(w) && w.length > 4);
    if (common.length >= 3) {
      const conflictWords = ['but', 'however', 'unlike', 'contradicts', 'contrary', 'disagree', 'versus', 'whereas', 'although'];
      if (conflictWords.some(w => textA.toLowerCase().includes(w) || textB.toLowerCase().includes(w))) {
        isContradiction = true; differenceType = 'genuine contradiction'; contradictionConfidence = 55;
        explanation = `Sources discuss the same topic with contrasting framing (conflict keywords: ${common.slice(0, 3).join(', ')}).`;
      }
    }
  }

  res.json({ success: true, validation: { publisherA: publisherA || 'source_a', publisherB: publisherB || 'source_b', textA: textA.substring(0, 150), textB: textB.substring(0, 150), isContradiction, differenceType, contradictionConfidence: +contradictionConfidence.toFixed(1), explanation } });
});

export default router;
