'use client';
import React, { useMemo } from 'react';
import { generateLevelLayout } from '../data/levelGen';
import { PortalPongConfigPreset } from './PortalPongGame';

interface Props {
  seed: number;
  preset: PortalPongConfigPreset;
  width?: number;
  height?: number;
}

const PLAT_THICKNESS = 5; // px — outline height of each platform bar

const LevelPreview: React.FC<Props> = ({ seed, preset, width = 480, height = 240 }) => {
  const layout = useMemo(
    () => generateLevelLayout(seed, preset),
    [seed, preset]
  );

  const { platforms, worldHalfWidth, gameHeight, goalCenterX, portalY } = layout;

  // World → SVG coordinate transforms (Y is flipped: world 0 = SVG bottom)
  const tx = (wx: number) => ((wx + worldHalfWidth) / (worldHalfWidth * 2)) * width;
  const ty = (wy: number) => height - (wy / gameHeight) * height;
  const sw = (worldW: number) => (worldW / (worldHalfWidth * 2)) * width;
  const sh = (worldH: number) => (worldH / gameHeight) * height;

  const groundY = ty(0);
  const portalSvgY = ty(portalY);
  const portalRx = tx(goalCenterX);
  const portalLx = tx(-goalCenterX);
  const portalRadiusY = sh(1.1); // portal is ~1.1 units tall
  const portalRadiusX = portalRadiusY * 0.32; // flattened ring shape

  // Platform geometry in SVG space
  const platRects = platforms.map((p, i) => {
    const cx = tx(p.x);
    const cy = ty(p.y);
    const pw = sw(p.width);
    const ph = Math.max(PLAT_THICKNESS, sh(0.16));
    const deg = -(p.tiltAngle * 180) / Math.PI; // SVG rotation is opposite to world
    return { cx, cy, pw, ph, deg, key: i };
  });

  return (
    <div
      style={{
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid rgba(34,211,238,0.25)',
        background: 'rgba(5,8,20,0.92)',
        display: 'inline-block',
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        <defs>
          {/* Platform glow */}
          <filter id="platGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Portal glow */}
          <filter id="portalGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Subtle grid */}
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
          </pattern>
        </defs>

        {/* Grid */}
        <rect width={width} height={height} fill="url(#grid)" />

        {/* Sky gradient */}
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(10,5,30,0)" />
            <stop offset="100%" stopColor="rgba(5,15,25,0.5)" />
          </linearGradient>
        </defs>
        <rect width={width} height={height} fill="url(#skyGrad)" />

        {/* Ground fill */}
        <rect
          x={0}
          y={groundY}
          width={width}
          height={height - groundY}
          fill="rgba(20,30,50,0.7)"
        />

        {/* Ground line */}
        <line
          x1={0} y1={groundY} x2={width} y2={groundY}
          stroke="#22d3ee" strokeWidth={1.5} strokeOpacity={0.6}
        />
        {/* Ground glow */}
        <line
          x1={0} y1={groundY} x2={width} y2={groundY}
          stroke="#22d3ee" strokeWidth={5} strokeOpacity={0.08}
        />

        {/* Side wall hints */}
        {[0, width].map((xw, idx) => (
          <line
            key={idx}
            x1={xw} y1={0} x2={xw} y2={groundY}
            stroke="rgba(100,180,255,0.12)" strokeWidth={1}
          />
        ))}

        {/* Platforms */}
        {platRects.map(({ cx, cy, pw, ph, deg, key }) => (
          <g key={key} transform={`rotate(${deg}, ${cx}, ${cy})`}>
            {/* Glow fill */}
            <rect
              x={cx - pw / 2} y={cy - ph / 2 - 3}
              width={pw} height={ph + 6}
              fill="rgba(34,211,238,0.08)"
              rx={2}
            />
            {/* Main bar */}
            <rect
              x={cx - pw / 2} y={cy - ph / 2}
              width={pw} height={ph}
              fill="none"
              stroke="#22d3ee"
              strokeWidth={1.5}
              strokeOpacity={0.85}
              rx={2}
              filter="url(#platGlow)"
            />
            {/* Top surface highlight */}
            <line
              x1={cx - pw / 2 + 2} y1={cy - ph / 2}
              x2={cx + pw / 2 - 2} y2={cy - ph / 2}
              stroke="rgba(180,240,255,0.5)"
              strokeWidth={1}
            />
          </g>
        ))}

        {/* Left portal ring */}
        <ellipse
          cx={portalLx} cy={portalSvgY}
          rx={portalRadiusX} ry={portalRadiusY}
          fill="rgba(168,85,247,0.12)"
          stroke="#a855f7"
          strokeWidth={2}
          filter="url(#portalGlow)"
        />
        {/* Right portal ring */}
        <ellipse
          cx={portalRx} cy={portalSvgY}
          rx={portalRadiusX} ry={portalRadiusY}
          fill="rgba(168,85,247,0.12)"
          stroke="#a855f7"
          strokeWidth={2}
          filter="url(#portalGlow)"
        />

        {/* Portal inner glow dots */}
        {[portalLx, portalRx].map((px, i) => (
          <ellipse
            key={i}
            cx={px} cy={portalSvgY}
            rx={portalRadiusX * 0.5} ry={portalRadiusY * 0.5}
            fill="rgba(192,132,252,0.18)"
          />
        ))}

        {/* Centre dashed divider */}
        <line
          x1={width / 2} y1={0} x2={width / 2} y2={groundY}
          stroke="rgba(255,255,255,0.07)" strokeWidth={1}
          strokeDasharray="4 6"
        />

        {/* Ball spawn marker */}
        <circle
          cx={width / 2} cy={ty(gameHeight * 0.62)}
          r={4}
          fill="rgba(251,191,36,0.5)"
          stroke="#fbbf24"
          strokeWidth={1}
        />
        <text
          x={width / 2 + 7} y={ty(gameHeight * 0.62) + 4}
          fill="rgba(251,191,36,0.55)"
          fontSize={9}
          fontFamily="monospace"
        >
          spawn
        </text>

        {/* Corner labels */}
        <text x={6} y={14} fill="rgba(34,211,238,0.35)" fontSize={9} fontFamily="monospace">
          GOAL
        </text>
        <text x={width - 30} y={14} fill="rgba(34,211,238,0.35)" fontSize={9} fontFamily="monospace">
          GOAL
        </text>
      </svg>
    </div>
  );
};

export default LevelPreview;
