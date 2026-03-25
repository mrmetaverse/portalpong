const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();

const parsePlayerFrame = (raw) => {
  if (!raw || typeof raw !== "string") {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
};

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const room = String(req.query.room || "").trim().toUpperCase();
  if (!room) {
    res.status(400).json({ ok: false, error: "Missing room code" });
    return;
  }

  try {
    const key = `portalpong:room:${room}`;
    const data = await redis.hgetall(key);
    const player1 = parsePlayerFrame(data?.player1);
    const player2 = parsePlayerFrame(data?.player2);

    res.status(200).json({
      ok: true,
      room,
      serverTime: Date.now(),
      player1,
      player2
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Failed to fetch room state" });
  }
};
