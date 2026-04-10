const { getRedis } = require("./_redis");

const TOP_N = 10;

const parseEntry = (entry) => {
  const [id, name] = String(entry).split("|");
  return { id, name: name || "Player" };
};

const fetchTop = async (db, key) => {
  const raw = await db.zrange(key, 0, TOP_N - 1, { rev: true, withScores: true });
  if (!raw || raw.length === 0) return [];
  const results = [];
  for (let i = 0; i < raw.length; i += 2) {
    const member = raw[i];
    const score = raw[i + 1];
    if (member == null) continue;
    const { id, name } = parseEntry(member);
    results.push({ id, name, score: Number(score) || 0, rank: results.length + 1 });
  }
  return results;
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const db = getRedis();

    const [winsAll, goalsAll, winsPvp, goalsPvp] = await Promise.all([
      fetchTop(db, "pp:lb:wins"),
      fetchTop(db, "pp:lb:goals"),
      fetchTop(db, "pp:lb:pvpwins"),
      fetchTop(db, "pp:lb:pvpgoals")
    ]);

    return res.status(200).json({
      ok: true,
      leaderboards: { winsAll, goalsAll, winsPvp, goalsPvp }
    });
  } catch (err) {
    console.error("leaderboard API error:", err);
    return res.status(200).json({ ok: true, leaderboards: { winsAll: [], goalsAll: [], winsPvp: [], goalsPvp: [] }, _offline: true });
  }
};
