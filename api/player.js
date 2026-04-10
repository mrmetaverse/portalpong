const { Redis } = require("@upstash/redis");

let redis;
function getRedis() {
  if (!redis) {
    redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
  return redis;
}

const PLAYER_TTL = 60 * 60 * 24 * 365;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const db = getRedis();

    if (req.method === "GET") {
      const id = String(req.query.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const data = await db.hgetall(`pp:player:${id}`);
      return res.status(200).json({ ok: true, player: data || null });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { id, username, color } = body;
      if (!id || !username) return res.status(400).json({ ok: false, error: "Missing id or username" });
      const key = `pp:player:${id}`;
      const exists = await db.exists(key);
      if (!exists) {
        await db.hset(key, {
          id, username: String(username).slice(0, 20), color: color || "cyan",
          createdAt: Date.now(),
          wins: 0, losses: 0, ties: 0,
          pvpWins: 0, pvpLosses: 0, pvpTies: 0,
          goalsFor: 0, goalsAgainst: 0,
          pvpGoalsFor: 0, pvpGoalsAgainst: 0,
          gamesAi: 0, gamesPvp: 0
        });
      } else {
        await db.hset(key, { username: String(username).slice(0, 20), color: color || "cyan" });
      }
      await db.expire(key, PLAYER_TTL);
      const player = await db.hgetall(key);
      return res.status(200).json({ ok: true, player });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("player API error:", err);
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, player: null, _offline: true });
    }
    return res.status(200).json({ ok: true, player: { id: req.body?.id || "local", username: req.body?.username || "Player" }, _offline: true });
  }
};
