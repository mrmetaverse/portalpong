#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const API_KEY = process.env.MESH_API_KEY;
if (!API_KEY) { console.error('MESH_API_KEY not set'); process.exit(1); }

const MODELS_DIR = path.join(__dirname, '..', 'public', 'models');
const STATE = JSON.parse(fs.readFileSync(path.join(__dirname, '.rig-new-state.json'), 'utf8'));

const CHARACTERS = ['wizard', 'knight', 'archer'];

function apiGet(urlPath) {
  return new Promise((resolve, reject) => {
    https.get({ hostname: 'api.meshy.ai', path: urlPath, headers: { 'Authorization': `Bearer ${API_KEY}` } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', reject);
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

async function main() {
  for (const charId of CHARACTERS) {
    const charDir = path.join(MODELS_DIR, charId);
    if (!fs.existsSync(charDir)) fs.mkdirSync(charDir, { recursive: true });

    const rigTaskId = STATE[`${charId}_rig`];
    if (!rigTaskId) { console.log(`No rig task for ${charId}`); continue; }

    // Fetch rig result for rigged model + walk/run
    console.log(`Fetching rig result for ${charId}...`);
    const rigData = await apiGet(`/openapi/v1/rigging/${rigTaskId}`);
    const r = rigData.result || {};

    if (r.rigged_character_glb_url) {
      await downloadFile(r.rigged_character_glb_url, path.join(charDir, 'rigged.glb'));
      console.log(`  ✓ rigged.glb`);
    }
    if (r.basic_animations?.walking_glb_url) {
      await downloadFile(r.basic_animations.walking_glb_url, path.join(charDir, 'walk.glb'));
      console.log(`  ✓ walk.glb`);
    }
    if (r.basic_animations?.running_glb_url) {
      await downloadFile(r.basic_animations.running_glb_url, path.join(charDir, 'run.glb'));
      console.log(`  ✓ run.glb`);
    }

    // Fetch animation results for idle, jump, cast, hit
    for (const animName of ['idle', 'jump', 'cast', 'hit']) {
      const animTaskId = STATE[`${charId}_anim_${animName}`];
      if (!animTaskId) continue;

      const animData = await apiGet(`/openapi/v1/animations/${animTaskId}`);
      const ar = animData.result || {};
      const animUrl = ar.animation_glb_url || ar.glb_url || ar.animated_glb_url || ar.model_url;
      if (animUrl) {
        await downloadFile(animUrl, path.join(charDir, `${animName}.glb`));
        console.log(`  ✓ ${animName}.glb`);
      } else {
        console.log(`  ✗ ${animName} — no URL found. Keys: ${Object.keys(ar).join(', ')}`);
      }
    }

    console.log(`✓ ${charId} done\n`);
  }
}

main().catch(console.error);
