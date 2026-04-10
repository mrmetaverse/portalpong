const { Redis } = require("@upstash/redis");

let redis;
function getRedis() {
  if (!redis) {
    redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
  return redis;
}

const inc = async (db, key, field, amount = 1) => {
  await db.hset(key, { [field]: 0 });
  return db.hincrby(key, field, amount);
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const db = getRedis();
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { player1Id, player2Id, winner, p1Score, p2Score, isVsAi } = body;
    if (!player1Id) return res.status(400).json({ ok: false, error: "Missing player1Id" });

    const isPvp = !isVsAi && !!player2Id;
    const p1Key = `pp:player:${player1Id}`;
    const p2Key = player2Id ? `pp:player:${player2Id}` : null;

    const p1exists = await db.exists(p1Key);
    if (!p1exists) await db.hset(p1Key, {
      id: player1Id, username: "Player", color: "cyan", createdAt: Date.now(),
      wins: 0, losses: 0, ties: 0, pvpWins: 0, pvpLosses: 0, pvpTies: 0,
      goalsFor: 0, goalsAgainst: 0, pvpGoalsFor: 0, pvpGoalsAgainst: 0, gamesAi: 0, gamesPvp: 0
    });

    const gs1 = Number(p1Score) || 0;
    const gs2 = Number(p2Score) || 0;

    await inc(db, p1Key, isVsAi ? "gamesAi" : "gamesPvp");
    await inc(db, p1Key, "goalsFor", gs1);
    await inc(db, p1Key, "goalsAgainst", gs2);

    if (winner === 1) {
      await inc(db, p1Key, "wins");
      if (isPvp) await inc(db, p1Key, "pvpWins");
    } else if (winner === 2) {
      await inc(db, p1Key, "losses");
      if (isPvp) await inc(db, p1Key, "pvpLosses");
    } else {
      await inc(db, p1Key, "ties");
      if (isPvp) await inc(db, p1Key, "pvpTies");
    }
    if (isPvp) {
      await inc(db, p1Key, "pvpGoalsFor", gs1);
      await inc(db, p1Key, "pvpGoalsAgainst", gs2);
    }

    if (p2Key && isPvp) {
      const p2exists = await db.exists(p2Key);
      if (!p2exists) await db.hset(p2Key, {
        id: player2Id, username: "Player", color: "lavender", createdAt: Date.now(),
        wins: 0, losses: 0, ties: 0, pvpWins: 0, pvpLosses: 0, pvpTies: 0,
        goalsFor: 0, goalsAgainst: 0, pvpGoalsFor: 0, pvpGoalsAgainst: 0, gamesAi: 0, gamesPvp: 0
      });
      await inc(db, p2Key, "gamesPvp");
      await inc(db, p2Key, "goalsFor", gs2);
      await inc(db, p2Key, "goalsAgainst", gs1);
      await inc(db, p2Key, "pvpGoalsFor", gs2);
      await inc(db, p2Key, "pvpGoalsAgainst", gs1);
      if (winner === 2) { await inc(db, p2Key, "wins"); await inc(db, p2Key, "pvpWins"); }
      else if (winner === 1) { await inc(db, p2Key, "losses"); await inc(db, p2Key, "pvpLosses"); }
      else { await inc(db, p2Key, "ties"); await inc(db, p2Key, "pvpTies"); }
    }

    const p1 = await db.hgetall(p1Key);
    if (p1) {
      const name = p1.username || "Player";
      await db.zadd("pp:lb:wins", { score: Number(p1.wins || 0), member: `${player1Id}|${name}` });
      await db.zadd("pp:lb:goals", { score: Number(p1.goalsFor || 0), member: `${player1Id}|${name}` });
      await db.zadd("pp:lb:pvpwins", { score: Number(p1.pvpWins || 0), member: `${player1Id}|${name}` });
      await db.zadd("pp:lb:pvpgoals", { score: Number(p1.pvpGoalsFor || 0), member: `${player1Id}|${name}` });
    }
    if (p2Key && isPvp) {
      const p2 = await db.hgetall(p2Key);
      if (p2) {
        const name2 = p2.username || "Player";
        await db.zadd("pp:lb:wins", { score: Number(p2.wins || 0), member: `${player2Id}|${name2}` });
        await db.zadd("pp:lb:goals", { score: Number(p2.goalsFor || 0), member: `${player2Id}|${name2}` });
        await db.zadd("pp:lb:pvpwins", { score: Number(p2.pvpWins || 0), member: `${player2Id}|${name2}` });
        await db.zadd("pp:lb:pvpgoals", { score: Number(p2.pvpGoalsFor || 0), member: `${player2Id}|${name2}` });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("match/complete API error:", err);
    return res.status(200).json({ ok: true, _offline: true });
  }
};
