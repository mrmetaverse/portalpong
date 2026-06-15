#!/usr/bin/env node
/**
 * PortalPong – Meshy AI asset generation script
 * Generates 6 character models + 8 powerup icons → public/models/
 *
 * Usage: node scripts/generate-assets.js
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── Load API key from .env.local ─────────────────────────────────────────────
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

// ── Asset definitions ────────────────────────────────────────────────────────

const CHARACTERS = [
  {
    id: 'wizard',
    prompt: 'Cartoon fantasy wizard character in A-pose, bright blue and purple robes with star patterns, tall pointed hat, magic wand, friendly rounded face, clean game asset style, centered, solid background'
  },
  {
    id: 'knight',
    prompt: 'Cartoon fantasy knight character in A-pose, shiny silver plate armor with cyan trim, broadsword and round shield attached to back, full helmet with visor, chunky heroic proportions, clean game asset style'
  },
  {
    id: 'rogue',
    prompt: 'Cartoon fantasy rogue character in A-pose, dark purple leather armor, hood and face mask, twin daggers at belt, slim agile silhouette, teal accents, clean game asset style'
  },
  {
    id: 'witch',
    prompt: 'Cartoon fantasy witch character in A-pose, dark emerald green robes, wide brim witch hat, glowing potion bottle staff, crescent moon motifs, mysterious expression, clean game asset style'
  },
  {
    id: 'berserker',
    prompt: 'Cartoon fantasy berserker warrior in A-pose, minimal fur and leather armor, giant double-headed axe on back, wild orange hair, muscular build, battle scars, fierce expression, clean game asset style'
  },
  {
    id: 'sage',
    prompt: 'Cartoon fantasy sage elder in A-pose, flowing white robes with golden rune trim, long silver beard, crystalline staff with glowing orb, serene wise expression, levitating slightly, clean game asset style'
  }
];

const POWERUP_ICONS = [
  { id: 'powerup_tripleJump',  prompt: 'Three glowing green upward arrows stacked vertically, floating magical powerup icon, energy aura, game UI asset, centered on dark background' },
  { id: 'powerup_permaFlight', prompt: 'Pair of glowing cyan ethereal wings, flying powerup icon, magical feathers dissolving into light particles, game asset' },
  { id: 'powerup_tripleBlast', prompt: 'Three orange magic energy orbs arranged in a triangle fan pattern, spell powerup icon, glowing tendrils connecting them, game asset' },
  { id: 'powerup_reflector',   prompt: 'Glowing blue energy shield sphere, force field powerup icon, hexagonal pattern on surface, magical barrier, game asset' },
  { id: 'powerup_teleport',    prompt: 'Swirling purple dimensional portal vortex, teleport powerup icon, spiral energy with stars, small floating diamond crystal, game asset' },
  { id: 'powerup_doubleSize',  prompt: 'Red magical growth crystal, double-size powerup icon, glowing with outward-pointing arrows embossed, energy aura, game asset' },
  { id: 'powerup_quarterSize', prompt: 'Tiny glowing yellow shrink mushroom, miniaturize powerup icon, sparkle particles around it, cute chibi style, game asset' },
  { id: 'powerup_homingShots', prompt: 'Pink magical targeting reticle orb, homing shots powerup icon, crosshair rings orbiting a central glowing core, energy tendrils, game asset' }
];

const ALL_ASSETS = [...CHARACTERS, ...POWERUP_ICONS];

// ── HTTP helpers ─────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

const apiRequest = (method, urlPath, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const options = {
    hostname: 'api.meshy.ai',
    path: urlPath,
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
    }
  };
  const req = https.request(options, res => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch { resolve({ _raw: raw, status: res.statusCode }); }
    });
  });
  req.on('error', reject);
  if (data) req.write(data);
  req.end();
});

const downloadFile = (url, dest) => new Promise((resolve, reject) => {
  const file = fs.createWriteStream(dest);
  const doGet = (u) => {
    https.get(u, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        doGet(res.headers.location);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  };
  doGet(url);
});

// ── Task lifecycle ────────────────────────────────────────────────────────────

const createPreview = (asset) =>
  apiRequest('POST', '/openapi/v2/text-to-3d', {
    mode: 'preview',
    prompt: asset.prompt,
    ai_model: 'meshy-5',
    target_formats: ['glb'],
    target_polycount: 8000,
    should_remesh: true,
    topology: 'triangle'
  });

const createRefine = (previewTaskId) =>
  apiRequest('POST', '/openapi/v2/text-to-3d', {
    mode: 'refine',
    preview_task_id: previewTaskId
  });

const pollTask = async (taskId, label, maxMinutes = 10) => {
  const deadline = Date.now() + maxMinutes * 60 * 1000;
  while (Date.now() < deadline) {
    const res = await apiRequest('GET', `/openapi/v2/text-to-3d/${taskId}`);
    const status = res.status;
    const pct = res.progress !== undefined ? `${res.progress}%` : '';
    process.stdout.write(`\r  ${label} [${status}] ${pct}       `);
    if (status === 'SUCCEEDED') { process.stdout.write('\n'); return res; }
    if (status === 'FAILED' || status === 'EXPIRED') {
      process.stdout.write('\n');
      throw new Error(`Task ${taskId} ${status}: ${JSON.stringify(res.task_error || res.error || '')}`);
    }
    await sleep(6000);
  }
  throw new Error(`Timeout polling ${taskId}`);
};

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n🎨 Generating ${ALL_ASSETS.length} assets via Meshy AI…\n`);

  const results = {};

  for (const asset of ALL_ASSETS) {
    const destPath = path.join(MODELS_DIR, `${asset.id}.glb`);
    if (fs.existsSync(destPath)) {
      console.log(`  ⏭️  ${asset.id}.glb already exists, skipping`);
      results[asset.id] = destPath;
      continue;
    }

    console.log(`\n📦 ${asset.id}`);

    // Stage 1: Preview
    process.stdout.write('  Creating preview task…');
    const previewRes = await createPreview(asset);
    if (!previewRes.result) {
      console.error('\n  ❌ Failed to create preview:', JSON.stringify(previewRes));
      continue;
    }
    const previewTaskId = previewRes.result;
    console.log(` task ${previewTaskId}`);

    let previewResult;
    try { previewResult = await pollTask(previewTaskId, `Preview ${asset.id}`); }
    catch (e) { console.error('  ❌', e.message); continue; }

    // Stage 2: Refine (adds textures)
    process.stdout.write('  Creating refine task…');
    const refineRes = await createRefine(previewTaskId);
    if (!refineRes.result) {
      console.error('\n  ❌ Failed to create refine:', JSON.stringify(refineRes));
      // Fall back to preview model
      const previewGlb = previewResult.model_urls?.glb;
      if (previewGlb) {
        console.log('  ⬇️  Downloading preview GLB (no texture)…');
        await downloadFile(previewGlb, destPath);
        console.log(`  ✅ Saved ${asset.id}.glb (preview only)`);
        results[asset.id] = destPath;
      }
      continue;
    }
    const refineTaskId = refineRes.result;
    console.log(` task ${refineTaskId}`);

    let refineResult;
    try { refineResult = await pollTask(refineTaskId, `Refine  ${asset.id}`, 15); }
    catch (e) { console.error('  ❌', e.message); continue; }

    const glbUrl = refineResult.model_urls?.glb;
    if (!glbUrl) { console.error('  ❌ No GLB URL in result:', JSON.stringify(refineResult).slice(0, 200)); continue; }

    process.stdout.write(`  ⬇️  Downloading…`);
    await downloadFile(glbUrl, destPath);
    console.log(` ✅ ${asset.id}.glb saved (${(fs.statSync(destPath).size / 1024).toFixed(0)} KB)`);
    results[asset.id] = destPath;

    // Small delay between assets to be polite to the API
    await sleep(2000);
  }

  console.log(`\n✨ Done! ${Object.keys(results).length}/${ALL_ASSETS.length} assets generated.\n`);
  console.log('Models saved to: public/models/');
  console.log(Object.keys(results).map(k => `  • ${k}.glb`).join('\n'));
})().catch(err => { console.error('Fatal:', err); process.exit(1); });
