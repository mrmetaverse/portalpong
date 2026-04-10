const { getRedis } = require("../_redis");

const parsePlayerFrame = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  try { return JSON.parse(raw); } catch { return null; }
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const room = String(req.query.room || "").trim().toUpperCase();
  if (!room) return res.status(400).json({ ok: false, error: "Missing room code" });

  try {
    const db = getRedis();
    const key = `portalpong:room:${room}`;
    const data = await db.hgetall(key);
    const player1 = parsePlayerFrame(data?.player1);
    const player2 = parsePlayerFrame(data?.player2);

    return res.status(200).json({ ok: true, room, serverTime: Date.now(), player1, player2 });
  } catch (err) {
    console.error("match/state API error:", err);
    return res.status(200).json({ ok: true, room: req.query.room, serverTime: Date.now(), player1: null, player2: null, _offline: true });
  }
};
