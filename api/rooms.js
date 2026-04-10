const { getRedis, resetRedis } = require("./_redis");

const ROOM_TTL = 60 * 60;
const MAX_PUBLIC_ROOMS = 30;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const db = getRedis();

    if (req.method === "GET") {
      const codes = await db.smembers("pp:rooms:open");
      if (!codes || codes.length === 0) return res.status(200).json({ ok: true, rooms: [] });

      const rooms = [];
      for (const code of codes.slice(0, MAX_PUBLIC_ROOMS)) {
        const data = await db.hgetall(`pp:lobby:${code}`);
        if (data && data.status === "waiting") rooms.push(data);
        else await db.srem("pp:rooms:open", code);
      }
      rooms.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      return res.status(200).json({ ok: true, rooms });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { code, hostId, hostName, hostColor, preset, background, seed, isPublic } = body;
      if (!code || !hostId) return res.status(400).json({ ok: false, error: "Missing code or hostId" });

      const room = {
        code, hostId, hostName: String(hostName || "Anonymous").slice(0, 20),
        hostColor: hostColor || "cyan",
        preset: preset || "normal", background: background || "random",
        seed: seed || Math.floor(Math.random() * 1e6),
        isPublic: isPublic ? "1" : "0",
        status: "waiting",
        createdAt: Date.now(),
        player1Id: hostId, player2Id: "", player2Name: "", player2Color: ""
      };

      await db.hset(`pp:lobby:${code}`, room);
      await db.expire(`pp:lobby:${code}`, ROOM_TTL);
      if (isPublic) {
        await db.sadd("pp:rooms:open", code);
        await db.expire("pp:rooms:open", ROOM_TTL);
      }
      return res.status(200).json({ ok: true, room });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("rooms API error:", err);
    resetRedis();
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, rooms: [], _offline: true });
    }
    return res.status(503).json({ ok: false, error: "Matchmaking server unavailable. Please try again." });
  }
};
