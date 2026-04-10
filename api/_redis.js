const { Redis } = require("@upstash/redis");

let redis;
let warnedAboutLocalFallback = false;

// ─── Local in-memory fallback (no Redis available) ────────────────────────────

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

// ─── ioredis adapter — same interface as @upstash/redis ───────────────────────
// Wraps a standard TCP Redis connection to expose the Upstash-style API that
// the rest of the codebase depends on.

class IoRedisAdapter {
  constructor(client) {
    this._client = client;
  }

  async hset(key, fields) {
    const flat = [];
    for (const [k, v] of Object.entries(fields || {})) {
      flat.push(k, v == null ? "" : String(v));
    }
    if (flat.length === 0) return 0;
    return this._client.hset(key, ...flat);
  }

  async hgetall(key) {
    const data = await this._client.hgetall(key);
    if (!data || Object.keys(data).length === 0) return null;
    return data;
  }

  async hincrby(key, field, amount) {
    return this._client.hincrby(key, field, Number(amount) || 0);
  }

  async expire(key, seconds) {
    return this._client.expire(key, Number(seconds) || 0);
  }

  async sadd(key, member) {
    return this._client.sadd(key, String(member));
  }

  async srem(key, member) {
    return this._client.srem(key, String(member));
  }

  async smembers(key) {
    return this._client.smembers(key);
  }

  async del(key) {
    return this._client.del(key);
  }

  async get(key) {
    return this._client.get(key);
  }

  async set(key, value, opts) {
    const val = typeof value === "string" ? value : JSON.stringify(value);
    if (opts && typeof opts.ex === "number") {
      return this._client.set(key, val, "EX", opts.ex);
    }
    return this._client.set(key, val);
  }

  async exists(key) {
    return this._client.exists(key);
  }

  // Upstash zadd takes { score, member }; ioredis takes (key, score, member)
  async zadd(key, payload) {
    return this._client.zadd(key, Number(payload.score) || 0, String(payload.member));
  }

  async zrem(key, member) {
    return this._client.zrem(key, String(member));
  }

  async zrangebyscore(key, min, max, opts = {}) {
    if (opts && typeof opts.count === "number") {
      return this._client.zrangebyscore(key, min, max, "LIMIT", 0, opts.count);
    }
    return this._client.zrangebyscore(key, min, max);
  }

  // Upstash zrange supports { rev, withScores }; map to ioredis equivalents
  async zrange(key, start, stop, opts = {}) {
    if (opts.rev && opts.withScores) {
      const raw = await this._client.zrevrange(key, start, stop, "WITHSCORES");
      return raw || [];
    }
    if (opts.rev) {
      return this._client.zrevrange(key, start, stop);
    }
    if (opts.withScores) {
      const raw = await this._client.zrange(key, start, stop, "WITHSCORES");
      return raw || [];
    }
    return this._client.zrange(key, start, stop);
  }

  async ping() {
    return this._client.ping();
  }

  quit() {
    return this._client.quit();
  }
}

// ─── Config detection ─────────────────────────────────────────────────────────

function isTcpRedisUrl(url) {
  return url.startsWith("redis://") || url.startsWith("rediss://");
}

function getUpstashConfig() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    "";
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    "";
  if (url && token) return { url, token };

  // Derive REST config from REDIS_URL only if it looks like an Upstash host
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL || "";
  if (redisUrl && isTcpRedisUrl(redisUrl)) {
    try {
      const parsed = new URL(redisUrl);
      const host = parsed.hostname || "";
      if (host.endsWith(".upstash.io")) {
        const tok = decodeURIComponent(parsed.password || "");
        if (tok && host) return { url: `https://${host}`, token: tok };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function getTcpRedisUrl() {
  const url = process.env.REDIS_URL || process.env.KV_URL || "";
  if (url && isTcpRedisUrl(url)) return url;
  return null;
}

// ─── Client factory ───────────────────────────────────────────────────────────

const REDIS_OP_TIMEOUT_MS = 2500;

function withTimeouts(client) {
  return new Proxy(client, {
    get(target, prop) {
      const val = target[prop];
      if (typeof val !== "function") return val;
      return function (...args) {
        const result = val.apply(target, args);
        if (result && typeof result.then === "function") {
          return Promise.race([
            result,
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error(`Redis op '${String(prop)}' timed out after ${REDIS_OP_TIMEOUT_MS}ms`)),
                REDIS_OP_TIMEOUT_MS
              )
            ),
          ]);
        }
        return result;
      };
    },
  });
}

function getRedis() {
  if (!redis) {
    const upstashConfig = getUpstashConfig();
    if (upstashConfig) {
      redis = withTimeouts(new Redis(upstashConfig));
      return redis;
    }

    const tcpUrl = getTcpRedisUrl();
    if (tcpUrl) {
      try {
        const IoRedis = require("ioredis");
        const client = new IoRedis(tcpUrl, {
          connectTimeout: 3000,
          commandTimeout: 2000,
          maxRetriesPerRequest: 1,
        });
        client.on("error", () => {
          // Suppress ioredis error events so they don't crash the process.
        });
        redis = withTimeouts(new IoRedisAdapter(client));
        return redis;
      } catch (err) {
        console.error("Failed to create ioredis client:", err.message);
      }
    }

    redis = new LocalRedisFallback();
    if (!warnedAboutLocalFallback) {
      warnedAboutLocalFallback = true;
      console.warn(
        "Redis config missing; using in-memory fallback for local/offline API behavior."
      );
    }
  }
  return redis;
}

function resetRedis() {
  if (redis && typeof redis.quit === "function") {
    try { redis.quit(); } catch { /* ignore */ }
  }
  redis = null;
}

module.exports = { getRedis, resetRedis };
