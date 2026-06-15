#!/usr/bin/env node
/**
 * Download already-completed Meshy preview GLBs using known task IDs
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const envPath = path.join(__dirname, '..', '.env.local');
let API_KEY = process.env.MESH_API_KEY;
if (!API_KEY && fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf-8');
  const m = env.match(/MESH_API_KEY\s*=\s*["']?([^\s"'\n]+)["']?/);
  if (m) API_KEY = m[1];
}
if (!API_KEY) { console.error('❌ MESH_API_KEY not found'); process.exit(1); }
console.log('✅ API key loaded');

const MODELS_DIR = path.join(__dirname, '..', 'public', 'models');
if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Task IDs captured from the previous generation run (all preview stages SUCCEEDED)
const KNOWN_TASKS = [
  { id: 'wizard',              taskId: '019d7339-1e16-728e-b642-a6c40b983999' },
  { id: 'knight',              taskId: '019d733d-d912-790c-a278-7bc7fb48e3f8' },
  { id: 'rogue',               taskId: '019d7342-2bc1-7b54-ae4c-80f619313b51' },
  { id: 'witch',               taskId: '019d7344-8df8-7ea0-aa57-1f294f11a3b1' },
  { id: 'berserker',           taskId: '019d7348-7f6a-7f81-bfa6-5a05420a5926' },
  { id: 'sage',                taskId: '019d734b-f79b-70bf-9041-62088f668b67' },
  { id: 'powerup_tripleJump',  taskId: '019d7350-b35a-7227-a8cb-1448173d3671' },
  { id: 'powerup_permaFlight', taskId: '019d7351-a0cf-7e17-b3f2-d54b5f0a6a85' },
];

// These still need to be generated (8 - 2 completed above = 6 remaining + remaining powerups)
const REMAINING_ASSETS = [
  { id: 'powerup_tripleBlast', prompt: 'Three orange magic energy orbs arranged in a triangle fan pattern, spell powerup icon, glowing tendrils connecting them, game asset, solid background' },
  { id: 'powerup_reflector',   prompt: 'Glowing blue energy shield sphere, force field powerup icon, hexagonal pattern on surface, magical barrier, game asset, solid background' },
  { id: 'powerup_teleport',    prompt: 'Swirling purple dimensional portal vortex, teleport powerup icon, spiral energy with stars, small floating diamond crystal, game asset, solid background' },
  { id: 'powerup_doubleSize',  prompt: 'Red magical growth crystal, double-size powerup icon, glowing with outward-pointing arrows embossed, energy aura, game asset, solid background' },
  { id: 'powerup_quarterSize', prompt: 'Tiny glowing yellow shrink mushroom, miniaturize powerup icon, sparkle particles around it, cute chibi style, game asset, solid background' },
  { id: 'powerup_homingShots', prompt: 'Pink magical targeting reticle orb, homing shots powerup icon, crosshair rings orbiting a central glowing core, energy tendrils, game asset, solid background' },
];

const apiRequest = (method, urlPath, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const options = {
    hostname: 'api.meshy.ai',
    path: urlPath, method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
    }
  };
  const req = https.request(options, res => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({ _raw: raw }); } });
  });
  req.on('error', reject);
  if (data) req.write(data);
  req.end();
});

const downloadFile = (url, dest) => new Promise((resolve, reject) => {
  const file = fs.createWriteStream(dest);
  const doGet = (u) => {
    https.get(u, res => {
      if (res.statusCode === 301 || res.statusCode === 302) { doGet(res.headers.location); return; }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  };
  doGet(url);
});

const pollTask = async (taskId, label, maxMinutes = 12) => {
  const deadline = Date.now() + maxMinutes * 60 * 1000;
  while (Date.now() < deadline) {
    const res = await apiRequest('GET', `/openapi/v2/text-to-3d/${taskId}`);
    const status = res.status;
    process.stdout.write(`\r  ${label} [${status}] ${res.progress ?? ''}%       `);
    if (status === 'SUCCEEDED') { process.stdout.write('\n'); return res; }
    if (status === 'FAILED' || status === 'EXPIRED') {
      process.stdout.write('\n');
      throw new Error(`${taskId} ${status}`);
    }
    await sleep(6000);
  }
  throw new Error(`Timeout ${taskId}`);
};

(async () => {
  // ── Phase 1: Fetch existing preview task results ──────────────────────────
  console.log('\n📥 Fetching GLBs from completed preview tasks…\n');
  for (const { id, taskId } of KNOWN_TASKS) {
    const dest = path.join(MODELS_DIR, `${id}.glb`);
    if (fs.existsSync(dest)) { console.log(`  ⏭️  ${id}.glb exists`); continue; }
    process.stdout.write(`  Fetching ${id} (${taskId.slice(0, 8)}…)  `);
    try {
      const result = await apiRequest('GET', `/openapi/v2/text-to-3d/${taskId}`);
      const glbUrl = result.model_urls?.glb;
      if (!glbUrl) { console.log(`❌ no URL (status: ${result.status})`); continue; }
      process.stdout.write('⬇️  downloading… ');
      await downloadFile(glbUrl, dest);
      console.log(`✅ ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`);
    } catch (e) { console.log(`❌ ${e.message}`); }
    await sleep(500);
  }

  // ── Phase 2: Generate remaining powerup assets ────────────────────────────
  console.log('\n🎨 Generating remaining powerup models…\n');
  for (const asset of REMAINING_ASSETS) {
    const dest = path.join(MODELS_DIR, `${asset.id}.glb`);
    if (fs.existsSync(dest)) { console.log(`  ⏭️  ${asset.id}.glb exists`); continue; }
    console.log(`\n📦 ${asset.id}`);
    process.stdout.write('  Creating preview task… ');
    const createRes = await apiRequest('POST', '/openapi/v2/text-to-3d', {
      mode: 'preview', prompt: asset.prompt, ai_model: 'meshy-5',
      target_formats: ['glb'], target_polycount: 6000, should_remesh: true
    });
    if (!createRes.result) { console.error('❌ create failed:', JSON.stringify(createRes)); continue; }
    const taskId = createRes.result;
    console.log(`task ${taskId}`);
    let result;
    try { result = await pollTask(taskId, asset.id); }
    catch (e) { console.error('  ❌', e.message); continue; }
    const glbUrl = result.model_urls?.glb;
    if (!glbUrl) { console.error('  ❌ no GLB URL'); continue; }
    process.stdout.write('  ⬇️  downloading… ');
    await downloadFile(glbUrl, dest);
    console.log(`✅ ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`);
    await sleep(2000);
  }

  const downloaded = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.glb'));
  console.log(`\n✨ Done! ${downloaded.length}/14 models in public/models/`);
  downloaded.forEach(f => console.log(`  • ${f}`));
})().catch(e => { console.error('Fatal:', e); process.exit(1); });
