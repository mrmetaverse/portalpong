#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const API_KEY = process.env.MESH_API_KEY;
if (!API_KEY) { console.error('MESH_API_KEY not set'); process.exit(1); }

const MODELS_DIR = path.join(__dirname, '..', 'public', 'models');
const STATE_FILE = path.join(__dirname, '.rig-new-state.json');

const CHARACTERS = [
  { id: 'wizard',  src: 'wizard_new.glb',  taskId: '019d74c5-f572-7737-a736-ea468b85961c' },
  { id: 'knight',  src: 'knight_new.glb',  taskId: '019d74c6-1267-773e-b8a6-fde100057a12' },
  { id: 'archer',  src: 'archer.glb',      taskId: '019d74c5-d006-7735-b6c4-c8e73c3fcaa1' },
];

const ANIMATIONS = [
  { name: 'idle',  actionId: 0 },
  { name: 'walk',  actionId: 57 },
  { name: 'run',   actionId: 2 },
  { name: 'jump',  actionId: 86 },
  { name: 'cast',  actionId: 17 },
  { name: 'hit',   actionId: 7 },
];

let state = {};
try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
function saveState() { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }

function apiRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.meshy.ai',
      path: urlPath,
      method,
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', () => { ws.close(); resolve(); });
    }).on('error', reject);
  });
}

async function pollTask(urlPath, label) {
  for (let i = 0; i < 120; i++) {
    const data = await apiRequest('GET', urlPath);
    const s = data.status || data.state;
    process.stdout.write(`  [${label}] ${s} ${data.progress ?? ''}%\r`);
    if (s === 'SUCCEEDED' || s === 'succeeded') { console.log(`  [${label}] SUCCEEDED`); return data; }
    if (s === 'FAILED' || s === 'failed') { console.error(`  [${label}] FAILED:`, data.message || data); return null; }
    await new Promise(r => setTimeout(r, 5000));
  }
  console.error(`  [${label}] TIMEOUT`);
  return null;
}

function glbToDataUri(filePath) {
  const buf = fs.readFileSync(filePath);
  return `data:application/octet-stream;base64,${buf.toString('base64')}`;
}

async function main() {
  for (const char of CHARACTERS) {
    const charDir = path.join(MODELS_DIR, char.id);
    if (!fs.existsSync(charDir)) fs.mkdirSync(charDir, { recursive: true });

    const srcPath = path.join(MODELS_DIR, char.src);
    if (!fs.existsSync(srcPath)) { console.error(`Missing ${srcPath}`); continue; }

    // Also copy as the base GLB for the character
    const baseDest = path.join(MODELS_DIR, `${char.id}.glb`);
    fs.copyFileSync(srcPath, baseDest);
    console.log(`Copied ${char.src} -> ${char.id}.glb`);

    // ── Rig ──────────────────────────────────────────────────────────────────
    const rigKey = `${char.id}_rig`;
    let rigTaskId = state[rigKey];

    // ── Remesh if needed ─────────────────────────────────────────────────────
    const remeshKey = `${char.id}_remesh`;
    let remeshTaskId = state[remeshKey];

    if (!remeshTaskId) {
      console.log(`  Remeshing ${char.id} (reducing face count)...`);
      const res = await apiRequest('POST', '/openapi/v1/remesh', {
        input_task_id: char.taskId,
        target_polycount: 10000,
      });
      remeshTaskId = res.result;
      if (!remeshTaskId) { console.error(`  Failed to start remesh for ${char.id}:`, res); continue; }
      state[remeshKey] = remeshTaskId;
      saveState();
    }

    console.log(`  Remesh task: ${remeshTaskId}`);
    const remeshResult = await pollTask(`/openapi/v1/remesh/${remeshTaskId}`, `${char.id} remesh`);
    if (!remeshResult) continue;

    // Use the remeshed model for rigging
    const remeshModelUrl = remeshResult.model_urls?.glb;
    if (remeshModelUrl) {
      await downloadFile(remeshModelUrl, path.join(MODELS_DIR, `${char.id}.glb`));
      console.log(`  Downloaded remeshed ${char.id}.glb`);
    }

    if (!rigTaskId) {
      console.log(`Rigging ${char.id}...`);
      const res = await apiRequest('POST', '/openapi/v1/rigging', {
        input_task_id: remeshTaskId,
      });
      rigTaskId = res.result;
      if (!rigTaskId) { console.error(`Failed to start rig for ${char.id}:`, res); continue; }
      state[rigKey] = rigTaskId;
      saveState();
    }

    console.log(`  Rig task: ${rigTaskId}`);
    const rigResult = await pollTask(`/openapi/v1/rigging/${rigTaskId}`, `${char.id} rig`);
    if (!rigResult) continue;

    // Download rigged model + built-in walk/run
    const riggedUrl = rigResult.output?.model || rigResult.model_urls?.glb;
    if (riggedUrl) {
      await downloadFile(riggedUrl, path.join(charDir, 'rigged.glb'));
      console.log(`  Downloaded rigged.glb`);
    }
    if (rigResult.output?.walk) {
      await downloadFile(rigResult.output.walk, path.join(charDir, 'walk.glb'));
      console.log(`  Downloaded walk.glb`);
    }
    if (rigResult.output?.run) {
      await downloadFile(rigResult.output.run, path.join(charDir, 'run.glb'));
      console.log(`  Downloaded run.glb`);
    }

    // ── Animations ───────────────────────────────────────────────────────────
    for (const anim of ANIMATIONS) {
      if (anim.name === 'walk' || anim.name === 'run') continue; // already from rigging
      const animKey = `${char.id}_anim_${anim.name}`;
      let animTaskId = state[animKey];

      if (!animTaskId) {
        console.log(`  Animating ${char.id} ${anim.name}...`);
        const res = await apiRequest('POST', '/openapi/v1/animations', {
          rig_task_id: rigTaskId,
          action_id: anim.actionId,
        });
        animTaskId = res.result;
        if (!animTaskId) { console.error(`  Failed to start anim ${anim.name}:`, res); continue; }
        state[animKey] = animTaskId;
        saveState();
      }

      const animResult = await pollTask(`/openapi/v1/animations/${animTaskId}`, `${char.id} ${anim.name}`);
      if (!animResult) continue;

      const animUrl = animResult.output?.model || animResult.model_urls?.glb;
      if (animUrl) {
        await downloadFile(animUrl, path.join(charDir, `${anim.name}.glb`));
        console.log(`  Downloaded ${anim.name}.glb`);
      }
    }

    console.log(`✓ ${char.id} complete\n`);
  }
}

main().catch(console.error);
