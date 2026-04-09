#!/usr/bin/env node
/**
 * PortalPong – Rig characters via Meshy Auto-Rigging API, then animate.
 *
 * Pipeline per character:
 *   1. Upload GLB → POST /openapi/v1/rigging  (gives rigged GLB + walk + run)
 *   2. POST /openapi/v1/animations for: Idle(0), Basic_Jump(86), Skill_01(17), BeHit_FlyUp(7)
 *   3. Download all GLBs to public/models/<character>/
 *
 * Usage: node scripts/rig-and-animate.js
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ── Config ───────────────────────────────────────────────────────────────────

const envPath = path.join(__dirname, '..', '.env.local');
let API_KEY = process.env.MESH_API_KEY;
if (!API_KEY && fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf-8');
  const m = env.match(/MESH_API_KEY\s*=\s*["']?([^\s"'\n]+)["']?/);
  if (m) API_KEY = m[1];
}
if (!API_KEY) { console.error('❌ MESH_API_KEY not found'); process.exit(1); }
console.log('✅ API key:', API_KEY.slice(0, 12) + '…');

const MODELS_ROOT = path.join(__dirname, '..', 'public', 'models');
const CHARACTERS  = ['wizard', 'knight', 'rogue', 'witch', 'berserker', 'sage'];

// Animation action_ids we want
const ANIMATIONS = [
  { name: 'idle',    actionId: 0  },
  { name: 'jump',    actionId: 86 },
  { name: 'cast',    actionId: 17 },
  { name: 'hit',     actionId: 7  },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── HTTP helpers ─────────────────────────────────────────────────────────────

const apiRequest = (method, urlPath, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const options = {
    hostname: 'api.meshy.ai', path: urlPath, method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
    }
  };
  const req = https.request(options, res => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({ _raw: raw, _status: res.statusCode }); } });
  });
  req.on('error', reject);
  if (data) req.write(data);
  req.end();
});

const downloadFile = (url, dest) => new Promise((resolve, reject) => {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = fs.createWriteStream(dest);
  const doGet = (u) => {
    https.get(u, res => {
      if (res.statusCode === 301 || res.statusCode === 302) { doGet(res.headers.location); return; }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  };
  doGet(url);
});

const pollTask = async (endpoint, taskId, label, maxMinutes = 15) => {
  const deadline = Date.now() + maxMinutes * 60 * 1000;
  while (Date.now() < deadline) {
    const res = await apiRequest('GET', `${endpoint}/${taskId}`);
    process.stdout.write(`\r    ${label} [${res.status}] ${res.progress ?? ''}%        `);
    if (res.status === 'SUCCEEDED') { process.stdout.write('\n'); return res; }
    if (res.status === 'FAILED' || res.status === 'EXPIRED' || res.status === 'CANCELED') {
      process.stdout.write('\n');
      throw new Error(`${taskId} ${res.status}: ${JSON.stringify(res.task_error || '')}`);
    }
    await sleep(5000);
  }
  throw new Error(`Timeout polling ${taskId}`);
};

// ── Convert local GLB to data URI for upload ─────────────────────────────────
const glbToDataUri = (filePath) => {
  const buf = fs.readFileSync(filePath);
  return `data:model/gltf-binary;base64,${buf.toString('base64')}`;
};

// ── State file (so we can resume if interrupted) ─────────────────────────────
const STATE_FILE = path.join(__dirname, '.rig-state.json');
const loadState = () => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch { return {}; }
};
const saveState = (state) => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const state = loadState();

  for (const charId of CHARACTERS) {
    console.log(`\n══════════════════ ${charId.toUpperCase()} ══════════════════`);
    const charDir = path.join(MODELS_ROOT, charId);
    if (!fs.existsSync(charDir)) fs.mkdirSync(charDir, { recursive: true });

    const srcGlb = path.join(MODELS_ROOT, `${charId}.glb`);
    if (!fs.existsSync(srcGlb)) {
      console.log(`  ❌ Source ${charId}.glb not found, skipping`);
      continue;
    }

    // ── Step 1: Rig ─────────────────────────────────────────────────────────
    let rigTaskId = state[`${charId}_rig`];
    let rigResult;

    const riggedGlb = path.join(charDir, 'rigged.glb');
    const walkGlb   = path.join(charDir, 'walk.glb');
    const runGlb    = path.join(charDir, 'run.glb');

    if (rigTaskId) {
      console.log(`  📎 Resuming rig task ${rigTaskId}`);
      rigResult = await apiRequest('GET', `/openapi/v1/rigging/${rigTaskId}`);
      if (rigResult.status !== 'SUCCEEDED') {
        rigResult = await pollTask('/openapi/v1/rigging', rigTaskId, `Rig ${charId}`);
      }
    } else {
      console.log('  🦴 Creating rig task…');
      const dataUri = glbToDataUri(srcGlb);
      const createRes = await apiRequest('POST', '/openapi/v1/rigging', {
        model_url: dataUri,
        height_meters: 1.7
      });
      if (!createRes.result) {
        console.error('  ❌ Failed to create rig:', JSON.stringify(createRes).slice(0, 300));
        continue;
      }
      rigTaskId = createRes.result;
      state[`${charId}_rig`] = rigTaskId;
      saveState(state);
      console.log(`    Task: ${rigTaskId}`);
      rigResult = await pollTask('/openapi/v1/rigging', rigTaskId, `Rig ${charId}`);
    }

    // Download rigged character + basic walk/run
    if (rigResult.result) {
      const r = rigResult.result;
      if (r.rigged_character_glb_url && !fs.existsSync(riggedGlb)) {
        process.stdout.write('  ⬇️  rigged.glb…');
        await downloadFile(r.rigged_character_glb_url, riggedGlb);
        console.log(` ✅ ${(fs.statSync(riggedGlb).size / 1024).toFixed(0)} KB`);
      }
      if (r.basic_animations) {
        if (r.basic_animations.walking_glb_url && !fs.existsSync(walkGlb)) {
          process.stdout.write('  ⬇️  walk.glb…');
          await downloadFile(r.basic_animations.walking_glb_url, walkGlb);
          console.log(` ✅ ${(fs.statSync(walkGlb).size / 1024).toFixed(0)} KB`);
        }
        if (r.basic_animations.running_glb_url && !fs.existsSync(runGlb)) {
          process.stdout.write('  ⬇️  run.glb…');
          await downloadFile(r.basic_animations.running_glb_url, runGlb);
          console.log(` ✅ ${(fs.statSync(runGlb).size / 1024).toFixed(0)} KB`);
        }
      }
    } else {
      console.error('  ❌ No rig result');
      continue;
    }

    // ── Step 2: Animations ──────────────────────────────────────────────────
    for (const { name, actionId } of ANIMATIONS) {
      const animGlb = path.join(charDir, `${name}.glb`);
      if (fs.existsSync(animGlb)) {
        console.log(`  ⏭️  ${name}.glb exists`);
        continue;
      }

      let animTaskId = state[`${charId}_anim_${name}`];
      let animResult;

      if (animTaskId) {
        console.log(`  📎 Resuming ${name} task ${animTaskId}`);
        animResult = await apiRequest('GET', `/openapi/v1/animations/${animTaskId}`);
        if (animResult.status !== 'SUCCEEDED') {
          animResult = await pollTask('/openapi/v1/animations', animTaskId, `${charId}/${name}`);
        }
      } else {
        console.log(`  🎬 Creating ${name} animation (action_id=${actionId})…`);
        const createRes = await apiRequest('POST', '/openapi/v1/animations', {
          rig_task_id: rigTaskId,
          action_id: actionId,
        });
        if (!createRes.result) {
          console.error(`  ❌ Failed to create ${name}:`, JSON.stringify(createRes).slice(0, 300));
          continue;
        }
        animTaskId = createRes.result;
        state[`${charId}_anim_${name}`] = animTaskId;
        saveState(state);
        console.log(`    Task: ${animTaskId}`);
        animResult = await pollTask('/openapi/v1/animations', animTaskId, `${charId}/${name}`);
      }

      if (animResult.result?.animation_glb_url) {
        process.stdout.write(`  ⬇️  ${name}.glb…`);
        await downloadFile(animResult.result.animation_glb_url, animGlb);
        console.log(` ✅ ${(fs.statSync(animGlb).size / 1024).toFixed(0)} KB`);
      } else {
        console.error(`  ❌ No animation URL for ${name}:`, JSON.stringify(animResult).slice(0, 200));
      }

      await sleep(1000);
    }
  }

  // Summary
  console.log('\n════════════════════════════════════');
  console.log('✨ Done! Character files:');
  for (const charId of CHARACTERS) {
    const charDir = path.join(MODELS_ROOT, charId);
    if (!fs.existsSync(charDir)) continue;
    const files = fs.readdirSync(charDir).filter(f => f.endsWith('.glb'));
    console.log(`  ${charId}/: ${files.join(', ')}`);
  }
})().catch(e => { console.error('Fatal:', e); process.exit(1); });
