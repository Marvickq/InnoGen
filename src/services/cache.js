import crypto from 'crypto';
import { getCache, setCache, isRedisEnabled } from './redis.js';

function hashQuery(query) {
  return crypto.createHash('md5').update(query.toLowerCase().trim()).digest('hex');
}

const memoryCache = new Map();
const MEMORY_TTL = 60 * 1000;

function getMemoryCache(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) { memoryCache.delete(key); return null; }
  return entry.value;
}

function setMemoryCache(key, value, ttlSeconds = 60) {
  memoryCache.set(key, { value, expiry: Date.now() + ttlSeconds * 1000 });
}

export async function getCachedSearch(query, provider) {
  const key = `search:${provider}:${hashQuery(query)}`;
  const redisVal = await getCache(key);
  if (redisVal) return redisVal;
  const memVal = getMemoryCache(key);
  if (memVal) return memVal;
  return null;
}

export async function setCachedSearch(query, provider, results, ttlSeconds = 300) {
  const key = `search:${provider}:${hashQuery(query)}`;
  await setCache(key, results, ttlSeconds);
  setMemoryCache(key, results, ttlSeconds);
}

export async function getCachedLLM(prompt, systemInstruction, model) {
  const combined = `${systemInstruction || ''}||${prompt}`;
  const key = `llm:${model || 'default'}:${hashQuery(combined)}`;
  const redisVal = await getCache(key);
  if (redisVal) return redisVal;
  const memVal = getMemoryCache(key);
  if (memVal) return memVal;
  return null;
}

export async function setCachedLLM(prompt, systemInstruction, model, response, ttlSeconds = 600) {
  const combined = `${systemInstruction || ''}||${prompt}`;
  const key = `llm:${model || 'default'}:${hashQuery(combined)}`;
  await setCache(key, response, ttlSeconds);
  setMemoryCache(key, response, ttlSeconds);
}

export function clearMemoryCache() {
  memoryCache.clear();
}
