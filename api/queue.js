const { getRedis } = require("./_redis");

const QUEUE_KEY = "pp:queue";
const MATCH_TTL = 120;
const ROOM_TTL = 3600;

const randomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const db = getRedis();

    if (req.method === "GET") {
      const id = String(req.query.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const matchKey = `pp:queue:match:${id}`;
      const matchData = await db.get(matchKey);
      if (matchData) {
        const parsed = typeof matchData === "string" ? JSON.parse(matchData) : matchData;
        return res.status(200).json({ ok: true, matched: true, ...parsed });
      }
      const all = await db.zrangebyscore(QUEUE_KEY, "-inf", "+inf");
      const pos = all ? all.findIndex((m) => {
        try { return JSON.parse(m).id === id; } catch { return false; }
      }) : -1;
      return res.status(200).json({ ok: true, matched: false, position: pos === -1 ? null : pos + 1, queueSize: all ? all.length : 0 });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { playerId, username, color, preset } = body;
      if (!playerId) return res.status(400).json({ ok: false, error: "Missing playerId" });

      const existingMatch = await db.get(`pp:queue:match:${playerId}`);
      if (existingMatch) {
        const parsed = typeof existingMatch === "string" ? JSON.parse(existingMatch) : existingMatch;
        return res.status(200).json({ ok: true, matched: true, ...parsed });
      }

      const waiting = await db.zrangebyscore(QUEUE_KEY, "-inf", "+inf", { count: 10 });
      let opponent = null;
      for (const entry of (waiting || [])) {
        try {
          const p = JSON.parse(entry);
          if (p.id !== playerId) { opponent = { entry, data: p }; break; }
        } catch { /* skip */ }
      }

      if (opponent) {
        await db.zrem(QUEUE_KEY, opponent.entry);
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
        await db.hset(`pp:lobby:${code}`, room);
        await db.expire(`pp:lobby:${code}`, ROOM_TTL);

        const p1Match = JSON.stringify({ roomCode: code, side: "player1" });
        const p2Match = JSON.stringify({ roomCode: code, side: "player2" });
        await db.set(`pp:queue:match:${opponent.data.id}`, p1Match, { ex: MATCH_TTL });
        await db.set(`pp:queue:match:${playerId}`, p2Match, { ex: MATCH_TTL });

        return res.status(200).json({ ok: true, matched: true, roomCode: code, side: "player2" });
      }

      const entry = JSON.stringify({ id: playerId, username: String(username || "Player").slice(0, 20), color, preset });
      await db.zadd(QUEUE_KEY, { score: Date.now(), member: entry });
      await db.expire(QUEUE_KEY, 300);
      return res.status(200).json({ ok: true, matched: false, inQueue: true });
    }

    if (req.method === "DELETE") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const id = String(body.playerId || req.query.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const all = await db.zrangebyscore(QUEUE_KEY, "-inf", "+inf");
      for (const entry of (all || [])) {
        try { if (JSON.parse(entry).id === id) { await db.zrem(QUEUE_KEY, entry); break; } } catch { /* skip */ }
      }
      await db.del(`pp:queue:match:${id}`);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("queue API error:", err);
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, matched: false, position: null, queueSize: 0, _offline: true });
    }
    return res.status(503).json({ ok: false, error: "Server temporarily unavailable. Please try again later." });
  }
};
