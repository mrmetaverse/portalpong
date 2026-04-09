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

const ROOM_TTL = 60 * 60;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const code = String(req.query.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing room code" });

  try {
    const db = getRedis();

    if (req.method === "GET") {
      const data = await db.hgetall(`pp:lobby:${code}`);
      return res.status(200).json({ ok: true, room: data || null });
    }

    if (req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { player2Id, player2Name, player2Color } = body;
      if (!player2Id) return res.status(400).json({ ok: false, error: "Missing player2Id" });
      const key = `pp:lobby:${code}`;
      const room = await db.hgetall(key);
      if (!room) return res.status(404).json({ ok: false, error: "Room not found" });
      if (room.status !== "waiting") return res.status(409).json({ ok: false, error: "Room not available" });

      await db.hset(key, {
        player2Id, player2Name: String(player2Name || "Challenger").slice(0, 20),
        player2Color: player2Color || "lavender", status: "starting"
      });
      await db.expire(key, ROOM_TTL);
      await db.srem("pp:rooms:open", code);
      const updated = await db.hgetall(key);
      return res.status(200).json({ ok: true, room: updated });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { status } = body;
      if (!status) return res.status(400).json({ ok: false, error: "Missing status" });
      await db.hset(`pp:lobby:${code}`, { status });
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      await db.del(`pp:lobby:${code}`);
      await db.srem("pp:rooms:open", code);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("lobby API error:", err);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
};
