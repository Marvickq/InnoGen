import { executeResearchGraph } from '../agents/researchGraph.js';
import { logger, incrementMetric, startTimer, endTimer } from './monitor.js';
import { db } from '../db/prisma.js';

let running = false;
let workerTimer = null;

export async function startWorker() {
  if (running) return;
  running = true;
  logger.info('[Worker] Background worker started.');
  process.nextTick(poll);
}

export function stopWorker() {
  running = false;
  if (workerTimer) clearTimeout(workerTimer);
  logger.info('[Worker] Background worker stopped.');
}

async function poll() {
  if (!running) return;
  try {
    const jobs = await db.job.findByStatus('PROCESSING');
    if (jobs && jobs.length > 0) {
      for (const job of jobs) {
        logger.info(`[Worker] Processing job ${job.id}...`);
        incrementMetric('graphExecutions');
        const timer = startTimer('graph');
        try {
          await executeResearchGraph(job.id);
          const dur = endTimer('graph');
          logger.info(`[Worker] Job ${job.id} completed in ${dur}ms.`);
          incrementMetric('jobsCompleted');
        } catch (err) {
          logger.error(`[Worker] Job ${job.id} failed: ${err.message}`);
          incrementMetric('jobsFailed');
          try { await db.job.update(job.id, { status: 'FAILED' }); } catch {}
        }
      }
    }
  } catch (err) {
    logger.error(`[Worker] Poll error: ${err.message}`);
  }
  if (running) {
    workerTimer = setTimeout(poll, 1000);
  }
}

export async function submitJob(jobId) {
  logger.info(`[Worker] Job ${jobId} submitted.`);
  process.nextTick(async () => {
    try { await executeResearchGraph(jobId); } catch (err) { logger.error(`[Worker] Job ${jobId} failed: ${err.message}`); }
  });
}