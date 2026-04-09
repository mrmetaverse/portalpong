/**
 * Pure (no Three.js) platform / portal layout generator.
 * Mirrors the logic in PortalPongGame.tsx generatePlatforms() so the
 * LevelPreview component can preview what a given seed will produce.
 *
 * NOTE: The game's random() is consumed once by resolveBackground before
 * platform generation, so the preview positions are approximate (1 call off
 * when background='random').  This is intentional and acceptable for UX.
 */

import { PortalPongConfigPreset } from '../components/PortalPongGame';

const PRESET_TO_PAIR_LIMIT: Record<PortalPongConfigPreset, number> = {
  light: 1,
  normal: 2,
  chaos: 3,
};

const buildRandom = (seed: number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const rb = (rng: () => number, min: number, max: number) => min + rng() * (max - min);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export interface PlatformLayout {
  x: number;
  y: number;
  width: number;
  tiltAngle: number; // radians
}

export interface LevelLayout {
  platforms: PlatformLayout[];
  worldHalfWidth: number;
  gameHeight: number;
  goalCenterX: number;
  portalY: number;
}

/** Default world dimensions that match typical game view bounds */
const DEFAULT_HALF_W = 10;
const DEFAULT_HEIGHT = 8;

export const generateLevelLayout = (
  seed: number,
  preset: PortalPongConfigPreset,
  worldHalfWidth = DEFAULT_HALF_W,
  gameHeight = DEFAULT_HEIGHT
): LevelLayout => {
  const rng = buildRandom(seed);
  const goalCenterX = worldHalfWidth - 1;
  const portalY = 2.4; // approximate portal mouth center

  const PORTAL_Y_MIN   = 1.0;
  const PORTAL_Y_MAX   = 3.8;
  const PORTAL_CLEAR_DIST = 2.4;

  const randTilt = (maxDeg: number) =>
    rb(rng, -maxDeg, maxDeg) * (Math.PI / 180);

  const platforms: PlatformLayout[] = [];
  const pairCount = PRESET_TO_PAIR_LIMIT[preset];
  const minY = 1.35;
  const maxY = Math.max(minY + 2.5, gameHeight - 0.7);
  const tierSpan = maxY - minY;
  const minTierGap = (tierSpan / (pairCount + 1)) * 1.1;

  // ── Centre platform ───────────────────────────────────────────────────────
  const cpW = rb(rng, 1.8, 2.6);
  const cpY = clamp(rb(rng, 2.2, 3.0), minY, 3.0);
  platforms.push({ x: 0, y: cpY, width: cpW, tiltAngle: randTilt(8) });

  // ── Symmetric side pairs ──────────────────────────────────────────────────
  let lastY = minY;
  for (let i = 0; i < pairCount; i++) {
    const laneT = (i + 1) / (pairCount + 1);
    const maxWidth = clamp(worldHalfWidth * 0.26, 1.8, 3.0);
    const width = rb(rng, 1.5, maxWidth);
    const minX = 2.5;

    const rawLaneY = minY + Math.pow(laneT, 0.8) * tierSpan;
    const clampedMin = Math.max(rawLaneY - 0.4, lastY + minTierGap);
    const clampedMax = Math.min(rawLaneY + 0.6, maxY);
    const y = clamp(
      rb(rng, clampedMin, Math.max(clampedMin + 0.05, clampedMax)),
      minY,
      maxY
    );
    lastY = y;

    const inPortalZone = y + 0.3 > PORTAL_Y_MIN && y - 0.3 < PORTAL_Y_MAX;
    const portalSafeEdge = inPortalZone
      ? goalCenterX - PORTAL_CLEAR_DIST
      : worldHalfWidth;
    const maxX = Math.max(
      minX + 0.25,
      Math.min(worldHalfWidth - width / 2 - 1.0, portalSafeEdge - width / 2)
    );
    const x = rb(rng, minX, maxX);
    const tilt = randTilt(12);
    platforms.push({ x,  y, width, tiltAngle:  tilt });
    platforms.push({ x: -x, y, width, tiltAngle: -tilt });
  }

  // ── Optional extra centre platforms ───────────────────────────────────────
  const extraCount = Math.floor(rb(rng, 0, 2));
  for (let i = 0; i < extraCount; i++) {
    const eW = rb(rng, 1.6, 2.4);
    const eY = clamp(rb(rng, maxY * 0.6, maxY), minY, maxY);
    platforms.push({ x: 0, y: eY, width: eW, tiltAngle: randTilt(10) });
  }

  return { platforms, worldHalfWidth, gameHeight, goalCenterX, portalY };
};
