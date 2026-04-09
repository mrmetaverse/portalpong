const { Redis } = require("@upstash/redis");
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const TOP_N = 10;

const parseEntry = (entry) => {
  const [id, name] = String(entry).split("|");
  return { id, name: name || "Player" };
};

const fetchTop = async (key) => {
  // zrevrangebyscore with scores, top N
  const raw = await redis.zrange(key, 0, TOP_N - 1, { rev: true, withScores: true });
  if (!raw || raw.length === 0) return [];
  // raw is interleaved [member, score, member, score, ...]
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
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const [winsAll, goalsAll, winsPvp, goalsPvp] = await Promise.all([
    fetchTop("pp:lb:wins"),
    fetchTop("pp:lb:goals"),
    fetchTop("pp:lb:pvpwins"),
    fetchTop("pp:lb:pvpgoals")
  ]);

  return res.status(200).json({
    ok: true,
    leaderboards: { winsAll, goalsAll, winsPvp, goalsPvp }
  });
};
