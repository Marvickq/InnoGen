import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
        })
  ),
  defaultMeta: { service: 'innogen' },
  transports: [
    new winston.transports.Console(),
    ...(process.env.LOG_FILE ? [new winston.transports.File({ filename: process.env.LOG_FILE })] : [])
  ]
});

const timers = new Map();
const metrics = {
  apiRequests: 0,
  apiLatencyMs: [],
  searches: 0,
  searchFailures: 0,
  llmCalls: 0,
  llmFailures: 0,
  graphExecutions: 0,
  graphDurationsMs: [],
  retries: 0,
  errors: 0,
  jobsCreated: 0,
  jobsCompleted: 0,
  jobsFailed: 0
};

export function startTimer(label) {
  timers.set(label, Date.now());
}

export function endTimer(label) {
  const start = timers.get(label);
  if (!start) return 0;
  const duration = Date.now() - start;
  timers.delete(label);
  return duration;
}

export function recordMetric(name, value) {
  if (name === 'apiLatencyMs') metrics.apiLatencyMs.push(value);
  else if (name === 'graphDurationMs') metrics.graphDurationsMs.push(value);
  else if (name in metrics && Array.isArray(metrics[name])) metrics[name].push(value);
}

export function incrementMetric(name) {
  if (name in metrics && typeof metrics[name] === 'number') metrics[name]++;
}

export function getMetrics() {
  return {
    ...metrics,
    apiLatencyAvg: metrics.apiLatencyMs.length > 0
      ? +(metrics.apiLatencyMs.reduce((a, b) => a + b, 0) / metrics.apiLatencyMs.length).toFixed(1)
      : 0,
    graphDurationAvg: metrics.graphDurationsMs.length > 0
      ? +(metrics.graphDurationsMs.reduce((a, b) => a + b, 0) / metrics.graphDurationsMs.length).toFixed(1)
      : 0,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  };
}

export function apiLogger(req, res, next) {
  const start = Date.now();
  metrics.apiRequests++;
  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.apiLatencyMs.push(duration);
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, {
      method: req.method, path: req.originalUrl, status: res.statusCode, duration
    });
  });
  next();
}

export function logError(context, error) {
  metrics.errors++;
  logger.error(`${context}: ${error.message}`, { error: error.stack || error.message });
}

export { logger };
