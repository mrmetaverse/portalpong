const { getRedis, resetRedis } = require("../_redis");

const ROOM_TTL_SECONDS = 60 * 30;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const db = getRedis();
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { room, player, input, jumpSeq, castSeq, sentAt } = body;

    if (!room || (player !== "player1" && player !== "player2") || !input) {
      return res.status(400).json({ ok: false, error: "Invalid payload" });
    }

    const normalizedRoom = String(room).trim().toUpperCase();
    if (!normalizedRoom) return res.status(400).json({ ok: false, error: "Invalid room code" });

    const safeInput = {
      left: Boolean(input.left),
      right: Boolean(input.right),
      down: Boolean(input.down),
      jumpHeld: Boolean(input.jumpHeld),
      aimX: Number(input.aimX) || 0,
      aimY: Number(input.aimY) || 0
    };

    const value = JSON.stringify({
      input: safeInput,
      jumpSeq: Number(jumpSeq) || 0,
      castSeq: Number(castSeq) || 0,
      sentAt: Number(sentAt) || Date.now(),
      serverTime: Date.now()
    });

    const key = `portalpong:room:${normalizedRoom}`;
    await db.hset(key, { [player]: value });
    await db.expire(key, ROOM_TTL_SECONDS);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("match/control API error:", err);
    resetRedis();
    return res.status(200).json({ ok: true, _offline: true });
  }
};
