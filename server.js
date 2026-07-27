import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';

dotenv.config();

import researchRouter from './src/routes/research.js';
import { registerWsClient } from './src/agents/researchGraph.js';
import { db } from './src/db/prisma.js';

import { startWorker, stopWorker } from './src/services/worker.js';
import { apiLogger, logger, getMetrics, incrementMetric } from './src/services/monitor.js';

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(apiLogger);

const publicPath = path.resolve(process.cwd());
app.use(express.static(publicPath));

app.use('/api/v1/research', researchRouter);

app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    product: 'InnoGen Autonomous Multi-Agent Research Engine',
    version: '6.0.0',
    timestamp: new Date().toISOString(),
    services: {
      apiGateway: 'ONLINE',
      researchGraphEngine: 'ONLINE',
      database: 'ONLINE',
      wsAgentStream: 'ONLINE'
    },
    uptime: process.uptime()
  });
});

app.get('/api/v1/metrics', (req, res) => {
  res.json({ success: true, metrics: getMetrics() });
});

const wss = new WebSocketServer({ server, path: '/ws/agent' });

wss.on('connection', (ws) => {
  logger.info('[WebSocket] Client connected to InnoGen Research Agent Feed');
  registerWsClient(ws);
  ws.send(JSON.stringify({
    node: 'System',
    status: 'CONNECTED',
    message: 'Connected to InnoGen 10-Agent Research Pipeline WebSocket'
  }));
});

async function start() {
  try {
    await db.job.findMany();
    logger.info('[Server] Database connection verified.');
  } catch (err) {
    logger.error(`[Server] Database connection failed: ${err.message}`);
    process.exit(1);
  }

  startWorker();

  server.listen(PORT, () => {
    logger.info(`=======================================================`);
    logger.info(`INNOGEN AUTONOMOUS RESEARCH ENGINE v6.0.0 ONLINE`);
    logger.info(`REST API:   http://localhost:${PORT}/api/v1/health`);
    logger.info(`WebSocket:  ws://localhost:${PORT}/ws/agent`);
    logger.info(`Workspace:  http://localhost:${PORT}/`);
    logger.info(`=======================================================`);
  });
}

process.on('SIGTERM', () => { logger.info('[Server] SIGTERM received. Shutting down...'); stopWorker(); process.exit(0); });
process.on('SIGINT', () => { logger.info('[Server] SIGINT received. Shutting down...'); stopWorker(); process.exit(0); });

start().catch(err => { logger.error(`[Server] Fatal startup error: ${err.message}`); process.exit(1); });
