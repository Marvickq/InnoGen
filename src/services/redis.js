import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || '';
let client = null;
let enabled = false;

export function getRedisClient() {
  if (client) return client;
  if (!REDIS_URL) {
    console.warn('[Redis] No REDIS_URL configured — running without Redis.');
    enabled = false;
    return null;
  }
  try {
    client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true
    });
    enabled = true;
    client.on('error', (err) => console.warn('[Redis] Connection error:', err.message));
    client.on('connect', () => console.log('[Redis] Connected.'));
    return client;
  } catch (err) {
    console.warn('[Redis] Failed to create client:', err.message);
    enabled = false;
    return null;
  }
}

export async function connectRedis() {
  const c = getRedisClient();
  if (c && enabled) {
    try { await c.connect(); } catch (e) { console.warn('[Redis] Connect failed:', e.message); enabled = false; }
  }
}

export function isRedisEnabled() { return enabled; }

export async function getCache(key) {
  if (!enabled || !client) return null;
  try {
    const val = await client.get(key);
    if (val) return JSON.parse(val);
    return null;
  } catch { return null; }
}

export async function setCache(key, value, ttlSeconds = 300) {
  if (!enabled || !client) return;
  try {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {}
}

export async function enqueueJob(jobId) {
  if (!enabled || !client) return false;
  try {
    await client.lpush('innogen:queue', jobId);
    return true;
  } catch { return false; }
}

export async function dequeueJob(timeout = 5) {
  if (!enabled || !client) return null;
  try {
    const result = await client.brpop('innogen:queue', timeout);
    if (result) return result[1];
    return null;
  } catch { return null; }
}

export async function setGraphState(jobId, state) {
  if (!enabled || !client) return;
  try {
    await client.setex(`innogen:graph:${jobId}`, 600, JSON.stringify(state));
  } catch {}
}

export async function getGraphState(jobId) {
  if (!enabled || !client) return null;
  try {
    const val = await client.get(`innogen:graph:${jobId}`);
    if (val) return JSON.parse(val);
    return null;
  } catch { return null; }
}

export async function acquireLock(key, ttlSeconds = 30) {
  if (!enabled || !client) return false;
  try {
    const result = await client.set(`innogen:lock:${key}`, '1', 'NX', 'EX', ttlSeconds);
    return result === 'OK';
  } catch { return false; }
}

export async function releaseLock(key) {
  if (!enabled || !client) return;
  try { await client.del(`innogen:lock:${key}`); } catch {}
}
