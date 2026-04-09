const { Redis } = require("@upstash/redis");
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const ROOM_TTL = 60 * 60;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const code = String(req.query.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing room code" });

  // GET — fetch room state (used for polling by both host and guest)
  if (req.method === "GET") {
    const data = await redis.hgetall(`pp:lobby:${code}`);
    return res.status(200).json({ ok: true, room: data || null });
  }

  // PUT — guest joins the room
  if (req.method === "PUT") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { player2Id, player2Name, player2Color } = body;
    if (!player2Id) return res.status(400).json({ ok: false, error: "Missing player2Id" });
    const key = `pp:lobby:${code}`;
    const room = await redis.hgetall(key);
    if (!room) return res.status(404).json({ ok: false, error: "Room not found" });
    if (room.status !== "waiting") return res.status(409).json({ ok: false, error: "Room not available" });

    await redis.hset(key, {
      player2Id, player2Name: String(player2Name || "Challenger").slice(0, 20),
      player2Color: player2Color || "lavender", status: "starting"
    });
    await redis.expire(key, ROOM_TTL);
    await redis.srem("pp:rooms:open", code);
    const updated = await redis.hgetall(key);
    return res.status(200).json({ ok: true, room: updated });
  }

  // POST — update room status (e.g., set to "playing" or "done")
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { status } = body;
    if (!status) return res.status(400).json({ ok: false, error: "Missing status" });
    await redis.hset(`pp:lobby:${code}`, { status });
    return res.status(200).json({ ok: true });
  }

  // DELETE — host cancels the room
  if (req.method === "DELETE") {
    await redis.del(`pp:lobby:${code}`);
    await redis.srem("pp:rooms:open", code);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
