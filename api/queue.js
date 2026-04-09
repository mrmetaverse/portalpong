const { Redis } = require("@upstash/redis");
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const QUEUE_KEY = "pp:queue";
const MATCH_TTL = 120;
const ROOM_TTL = 3600;

const randomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // GET ?id=xxx — check if matched
  if (req.method === "GET") {
    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
    const matchKey = `pp:queue:match:${id}`;
    const matchData = await redis.get(matchKey);
    if (matchData) {
      const parsed = typeof matchData === "string" ? JSON.parse(matchData) : matchData;
      return res.status(200).json({ ok: true, matched: true, ...parsed });
    }
    // Return position in queue
    const all = await redis.zrangebyscore(QUEUE_KEY, "-inf", "+inf");
    const pos = all ? all.findIndex((m) => {
      try { return JSON.parse(m).id === id; } catch { return false; }
    }) : -1;
    return res.status(200).json({ ok: true, matched: false, position: pos === -1 ? null : pos + 1, queueSize: all ? all.length : 0 });
  }

  // POST — join queue
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { playerId, username, color, preset } = body;
    if (!playerId) return res.status(400).json({ ok: false, error: "Missing playerId" });

    // Check if already matched
    const existingMatch = await redis.get(`pp:queue:match:${playerId}`);
    if (existingMatch) {
      const parsed = typeof existingMatch === "string" ? JSON.parse(existingMatch) : existingMatch;
      return res.status(200).json({ ok: true, matched: true, ...parsed });
    }

    // Find a waiting player
    const waiting = await redis.zrangebyscore(QUEUE_KEY, "-inf", "+inf", { count: 10 });
    let opponent = null;
    for (const entry of (waiting || [])) {
      try {
        const p = JSON.parse(entry);
        if (p.id !== playerId) { opponent = { entry, data: p }; break; }
      } catch { /* skip */ }
    }

    if (opponent) {
      // Match found — create a room
      await redis.zrem(QUEUE_KEY, opponent.entry);
      const code = randomCode();
      const seed = Math.floor(Math.random() * 1e6);
      const room = {
        code, status: "starting",
        hostId: opponent.data.id, hostName: opponent.data.username, hostColor: opponent.data.color || "cyan",
        player1Id: opponent.data.id, player2Id: playerId,
        player2Name: String(username || "Player").slice(0, 20), player2Color: color || "lavender",
        preset: preset || opponent.data.preset || "normal", background: "random", seed,
        isPublic: "0", createdAt: Date.now()
      };
      await redis.hset(`pp:lobby:${code}`, room);
      await redis.expire(`pp:lobby:${code}`, ROOM_TTL);

      // Notify both players
      const p1Match = JSON.stringify({ roomCode: code, side: "player1" });
      const p2Match = JSON.stringify({ roomCode: code, side: "player2" });
      await redis.set(`pp:queue:match:${opponent.data.id}`, p1Match, { ex: MATCH_TTL });
      await redis.set(`pp:queue:match:${playerId}`, p2Match, { ex: MATCH_TTL });

      return res.status(200).json({ ok: true, matched: true, roomCode: code, side: "player2" });
    }

    // No opponent found — add to queue
    const entry = JSON.stringify({ id: playerId, username: String(username || "Player").slice(0, 20), color, preset });
    await redis.zadd(QUEUE_KEY, { score: Date.now(), member: entry });
    await redis.expire(QUEUE_KEY, 300); // queue expires after 5 min if abandoned
    return res.status(200).json({ ok: true, matched: false, inQueue: true });
  }

  // DELETE — leave queue
  if (req.method === "DELETE") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const id = String(body.playerId || req.query.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
    const all = await redis.zrangebyscore(QUEUE_KEY, "-inf", "+inf");
    for (const entry of (all || [])) {
      try { if (JSON.parse(entry).id === id) { await redis.zrem(QUEUE_KEY, entry); break; } } catch { /* skip */ }
    }
    await redis.del(`pp:queue:match:${id}`);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
