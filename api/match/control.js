const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN
});
const ROOM_TTL_SECONDS = 60 * 30;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { room, player, input, jumpSeq, castSeq, sentAt } = body;

    if (!room || (player !== "player1" && player !== "player2") || !input) {
      res.status(400).json({ ok: false, error: "Invalid payload" });
      return;
    }

    const normalizedRoom = String(room).trim().toUpperCase();
    if (!normalizedRoom) {
      res.status(400).json({ ok: false, error: "Invalid room code" });
      return;
    }

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
    await redis.hset(key, { [player]: value });
    await redis.expire(key, ROOM_TTL_SECONDS);

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Failed to store control frame" });
  }
};
