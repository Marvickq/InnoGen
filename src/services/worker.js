import { dequeueJob, enqueueJob } from './redis.js';
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
    const jobId = await dequeueJob(3);
    if (jobId) {
      logger.info(`[Worker] Processing job ${jobId}...`);
      incrementMetric('graphExecutions');
      const timer = startTimer('graph');
      try {
        await executeResearchGraph(jobId);
        const dur = endTimer('graph');
        logger.info(`[Worker] Job ${jobId} completed in ${dur}ms.`);
        incrementMetric('jobsCompleted');
      } catch (err) {
        logger.error(`[Worker] Job ${jobId} failed: ${err.message}`);
        incrementMetric('jobsFailed');
        try { db.job.update(jobId, { status: 'FAILED' }); } catch {}
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
  const queued = await enqueueJob(jobId);
  if (queued) {
    logger.info(`[Worker] Job ${jobId} submitted to queue.`);
  } else {
    logger.warn(`[Worker] Redis unavailable — executing job ${jobId} inline.`);
    process.nextTick(async () => {
          try { await executeResearchGraph(jobId); } catch (err) { logger.error(`[Worker] Inline job ${jobId} failed: ${err.message}`); }
        });
  }
}
