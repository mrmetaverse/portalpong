const { Redis } = require("@upstash/redis");

let redis;

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
    if (!config) {
      throw new Error(
        "Missing Redis config. Set KV_REST_API_URL + KV_REST_API_TOKEN, UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or REDIS_URL."
      );
    }
    redis = new Redis(config);
  }
  return redis;
}

module.exports = { getRedis };
