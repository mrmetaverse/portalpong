const { Redis } = require("@upstash/redis");

let redis;
let warnedAboutLocalFallback = false;

class LocalRedisFallback {
  constructor() {
    this.kv = new Map();
    this.hashes = new Map();
    this.sets = new Map();
    this.sortedSets = new Map();
    this.expiry = new Map();
  }

  _isExpired(key) {
    const expiresAt = this.expiry.get(key);
    if (!expiresAt) return false;
    if (Date.now() < expiresAt) return false;
    this.expiry.delete(key);
    this.kv.delete(key);
    this.hashes.delete(key);
    this.sets.delete(key);
    this.sortedSets.delete(key);
    return true;
  }

  _ensureHash(key) {
    this._isExpired(key);
    if (!this.hashes.has(key)) this.hashes.set(key, {});
    return this.hashes.get(key);
  }

  _ensureSet(key) {
    this._isExpired(key);
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    return this.sets.get(key);
  }

  _ensureSortedSet(key) {
    this._isExpired(key);
    if (!this.sortedSets.has(key)) this.sortedSets.set(key, new Map());
    return this.sortedSets.get(key);
  }

  async hset(key, value) {
    const h = this._ensureHash(key);
    Object.entries(value || {}).forEach(([field, v]) => {
      h[field] = typeof v === "number" ? String(v) : String(v ?? "");
    });
    return 1;
  }

  async hgetall(key) {
    if (this._isExpired(key)) return null;
    const h = this.hashes.get(key);
    if (!h) return null;
    return { ...h };
  }

  async hincrby(key, field, amount) {
    const h = this._ensureHash(key);
    const next = (Number(h[field]) || 0) + Number(amount || 0);
    h[field] = String(next);
    return next;
  }

  async expire(key, seconds) {
    if (
      !this.kv.has(key) &&
      !this.hashes.has(key) &&
      !this.sets.has(key) &&
      !this.sortedSets.has(key)
    ) {
      return 0;
    }
    this.expiry.set(key, Date.now() + Number(seconds || 0) * 1000);
    return 1;
  }

  async sadd(key, member) {
    const s = this._ensureSet(key);
    const before = s.size;
    s.add(String(member));
    return s.size > before ? 1 : 0;
  }

  async srem(key, member) {
    if (this._isExpired(key)) return 0;
    const s = this.sets.get(key);
    if (!s) return 0;
    return s.delete(String(member)) ? 1 : 0;
  }

  async smembers(key) {
    if (this._isExpired(key)) return [];
    const s = this.sets.get(key);
    return s ? [...s] : [];
  }

  async del(key) {
    this.expiry.delete(key);
    const removed =
      this.kv.delete(key) ||
      this.hashes.delete(key) ||
      this.sets.delete(key) ||
      this.sortedSets.delete(key);
    return removed ? 1 : 0;
  }

  async get(key) {
    if (this._isExpired(key)) return null;
    return this.kv.has(key) ? this.kv.get(key) : null;
  }

  async set(key, value, opts) {
    this.kv.set(key, typeof value === "string" ? value : JSON.stringify(value));
    if (opts && typeof opts.ex === "number") {
      this.expiry.set(key, Date.now() + opts.ex * 1000);
    } else {
      this.expiry.delete(key);
    }
    return "OK";
  }

  async exists(key) {
    this._isExpired(key);
    if (this.kv.has(key)) return 1;
    if (this.hashes.has(key)) return 1;
    if (this.sets.has(key)) return 1;
    if (this.sortedSets.has(key)) return 1;
    return 0;
  }

  async zadd(key, payload) {
    const z = this._ensureSortedSet(key);
    z.set(String(payload.member), Number(payload.score) || 0);
    return 1;
  }

  async zrem(key, member) {
    if (this._isExpired(key)) return 0;
    const z = this.sortedSets.get(key);
    if (!z) return 0;
    return z.delete(String(member)) ? 1 : 0;
  }

  async zrangebyscore(key, min, max, opts = {}) {
    if (this._isExpired(key)) return [];
    const z = this.sortedSets.get(key);
    if (!z) return [];
    const minV = min === "-inf" ? -Infinity : Number(min);
    const maxV = max === "+inf" ? Infinity : Number(max);
    const members = [...z.entries()]
      .filter(([, score]) => score >= minV && score <= maxV)
      .sort((a, b) => a[1] - b[1])
      .map(([member]) => member);
    if (opts && typeof opts.count === "number") {
      return members.slice(0, opts.count);
    }
    return members;
  }

  async zrange(key, start, stop, opts = {}) {
    if (this._isExpired(key)) return [];
    const z = this.sortedSets.get(key);
    if (!z) return [];
    const items = [...z.entries()].sort((a, b) => a[1] - b[1]);
    if (opts.rev) items.reverse();
    const lastIndex = stop < 0 ? items.length + stop : stop;
    const sliced = items.slice(start, lastIndex + 1);
    if (opts.withScores) {
      const out = [];
      sliced.forEach(([member, score]) => {
        out.push(member, String(score));
      });
      return out;
    }
    return sliced.map(([member]) => member);
  }
}

function deriveRestConfigFromRedisUrl() {
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL || "";
  if (!redisUrl) return null;
  try {
    const parsed = new URL(redisUrl);
    const token = decodeURIComponent(parsed.password || "");
    const host = parsed.hostname || "";
    if (!token || !host) return null;
    return {
      url: `https://${host}`,
      token,
    };
  } catch {
    return null;
  }
}

function getRedisConfig() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    "";
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    "";

  if (url && token) {
    return { url, token };
  }
  return deriveRestConfigFromRedisUrl();
}

function getRedis() {
  if (!redis) {
    const config = getRedisConfig();
    if (config) {
      redis = new Redis(config);
    } else {
      redis = new LocalRedisFallback();
      if (!warnedAboutLocalFallback) {
        warnedAboutLocalFallback = true;
        console.warn(
          "Redis config missing; using in-memory fallback for local/offline API behavior."
        );
      }
    }
  }
  return redis;
}

module.exports = { getRedis };
