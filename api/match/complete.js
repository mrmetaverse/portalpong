const { Redis } = require("@upstash/redis");
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const inc = async (key, field, amount = 1) => {
  await redis.hset(key, { [field]: 0 }); // ensure field exists
  return redis.hincrby(key, field, amount);
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const { player1Id, player2Id, winner, p1Score, p2Score, isVsAi } = body;
  if (!player1Id) return res.status(400).json({ ok: false, error: "Missing player1Id" });

  const isPvp = !isVsAi && !!player2Id;
  const p1Key = `pp:player:${player1Id}`;
  const p2Key = player2Id ? `pp:player:${player2Id}` : null;

  // Ensure player records exist (idempotent)
  const p1exists = await redis.exists(p1Key);
  if (!p1exists) await redis.hset(p1Key, {
    id: player1Id, username: "Player", color: "cyan", createdAt: Date.now(),
    wins: 0, losses: 0, ties: 0, pvpWins: 0, pvpLosses: 0, pvpTies: 0,
    goalsFor: 0, goalsAgainst: 0, pvpGoalsFor: 0, pvpGoalsAgainst: 0, gamesAi: 0, gamesPvp: 0
  });

  const gs1 = Number(p1Score) || 0;
  const gs2 = Number(p2Score) || 0;

  // Update player1 stats
  await inc(p1Key, isVsAi ? "gamesAi" : "gamesPvp");
  await inc(p1Key, "goalsFor", gs1);
  await inc(p1Key, "goalsAgainst", gs2);

  if (winner === 1) {
    await inc(p1Key, "wins");
    if (isPvp) await inc(p1Key, "pvpWins");
  } else if (winner === 2) {
    await inc(p1Key, "losses");
    if (isPvp) await inc(p1Key, "pvpLosses");
  } else {
    await inc(p1Key, "ties");
    if (isPvp) await inc(p1Key, "pvpTies");
  }
  if (isPvp) {
    await inc(p1Key, "pvpGoalsFor", gs1);
    await inc(p1Key, "pvpGoalsAgainst", gs2);
  }

  // Update player2 stats (mirror)
  if (p2Key && isPvp) {
    const p2exists = await redis.exists(p2Key);
    if (!p2exists) await redis.hset(p2Key, {
      id: player2Id, username: "Player", color: "lavender", createdAt: Date.now(),
      wins: 0, losses: 0, ties: 0, pvpWins: 0, pvpLosses: 0, pvpTies: 0,
      goalsFor: 0, goalsAgainst: 0, pvpGoalsFor: 0, pvpGoalsAgainst: 0, gamesAi: 0, gamesPvp: 0
    });
    await inc(p2Key, "gamesPvp");
    await inc(p2Key, "goalsFor", gs2);
    await inc(p2Key, "goalsAgainst", gs1);
    await inc(p2Key, "pvpGoalsFor", gs2);
    await inc(p2Key, "pvpGoalsAgainst", gs1);
    if (winner === 2) { await inc(p2Key, "wins"); await inc(p2Key, "pvpWins"); }
    else if (winner === 1) { await inc(p2Key, "losses"); await inc(p2Key, "pvpLosses"); }
    else { await inc(p2Key, "ties"); await inc(p2Key, "pvpTies"); }
  }

  // Update leaderboard sorted sets
  const p1 = await redis.hgetall(p1Key);
  if (p1) {
    const name = p1.username || "Player";
    await redis.zadd("pp:lb:wins", { score: Number(p1.wins || 0), member: `${player1Id}|${name}` });
    await redis.zadd("pp:lb:goals", { score: Number(p1.goalsFor || 0), member: `${player1Id}|${name}` });
    await redis.zadd("pp:lb:pvpwins", { score: Number(p1.pvpWins || 0), member: `${player1Id}|${name}` });
    await redis.zadd("pp:lb:pvpgoals", { score: Number(p1.pvpGoalsFor || 0), member: `${player1Id}|${name}` });
  }
  if (p2Key && isPvp) {
    const p2 = await redis.hgetall(p2Key);
    if (p2) {
      const name2 = p2.username || "Player";
      await redis.zadd("pp:lb:wins", { score: Number(p2.wins || 0), member: `${player2Id}|${name2}` });
      await redis.zadd("pp:lb:goals", { score: Number(p2.goalsFor || 0), member: `${player2Id}|${name2}` });
      await redis.zadd("pp:lb:pvpwins", { score: Number(p2.pvpWins || 0), member: `${player2Id}|${name2}` });
      await redis.zadd("pp:lb:pvpgoals", { score: Number(p2.pvpGoalsFor || 0), member: `${player2Id}|${name2}` });
    }
  }

  return res.status(200).json({ ok: true });
};
