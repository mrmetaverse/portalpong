const { Redis } = require("@upstash/redis");
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const ROOM_TTL = 60 * 60; // 1 hour
const MAX_PUBLIC_ROOMS = 30;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // GET /api/rooms — list open public rooms
  if (req.method === "GET") {
    const codes = await redis.smembers("pp:rooms:open");
    if (!codes || codes.length === 0) return res.status(200).json({ ok: true, rooms: [] });

    const rooms = [];
    for (const code of codes.slice(0, MAX_PUBLIC_ROOMS)) {
      const data = await redis.hgetall(`pp:lobby:${code}`);
      if (data && data.status === "waiting") rooms.push(data);
      else await redis.srem("pp:rooms:open", code); // stale entry cleanup
    }
    rooms.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    return res.status(200).json({ ok: true, rooms });
  }

  // POST /api/rooms — create a lobby room
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

    await redis.hset(`pp:lobby:${code}`, room);
    await redis.expire(`pp:lobby:${code}`, ROOM_TTL);
    if (isPublic) {
      await redis.sadd("pp:rooms:open", code);
      await redis.expire("pp:rooms:open", ROOM_TTL);
    }
    return res.status(200).json({ ok: true, room });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
