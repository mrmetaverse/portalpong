'use client';
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  CHARACTER_LIST,
  CHARACTERS,
  CharacterType,
  CharacterDef,
  getRpsMultiplier,
} from '../data/characters';

interface Props {
  /** Which side is selecting (1 = left/red, 2 = right/blue). undefined = single player picks one */
  side?: 1 | 2;
  /** Currently chosen character */
  selected: CharacterType;
  onSelect: (id: CharacterType) => void;
  /** Opponent character (for RPS display) */
  opponent?: CharacterType;
  /** Called when the user confirms and wants to continue */
  onConfirm: () => void;
  /** Label for the confirm button */
  confirmLabel?: string;
}

// ── Stat bar ─────────────────────────────────────────────────────────────────

const STAT_LABELS: { key: keyof CharacterDef['stats']; label: string; invert?: boolean }[] = [
  { key: 'speed',    label: 'Speed'    },
  { key: 'jump',     label: 'Jump'     },
  { key: 'power',    label: 'Power'    },
  { key: 'defense',  label: 'Defense'  },
  { key: 'cooldown', label: 'Recharge', invert: true },
];

const StatBar = ({ value, invert, color }: { value: number; invert?: boolean; color: string }) => {
  const pct = invert ? (1 / value) : value;
  const w = Math.min(100, Math.round((pct / 2.5) * 100));
  return (
    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${w}%`, background: color }}
      />
    </div>
  );
};

// ── 3-D preview canvas ────────────────────────────────────────────────────────

const ModelPreview = ({ modelPath, color }: { modelPath: string; color: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef  = useRef<{ cleanup: () => void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(200, 260);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 200 / 260, 0.1, 100);
    camera.position.set(0, 1.4, 4.5);
    camera.lookAt(0, 1.0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dLight.position.set(2, 4, 3);
    scene.add(dLight);
    const rimLight = new THREE.DirectionalLight(new THREE.Color(color), 0.5);
    rimLight.position.set(-3, 2, -2);
    scene.add(rimLight);

    // Fallback mesh shown while loading (or if model fails)
    const fallbackGeo  = new THREE.CapsuleGeometry(0.4, 1.0, 4, 8);
    const fallbackMat  = new THREE.MeshStandardMaterial({ color });
    const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
    fallbackMesh.position.y = 0.7;
    scene.add(fallbackMesh);

    let modelObj: THREE.Object3D | null = null;
    let rafId = 0;
    let angle = 0;

    const themeCol = new THREE.Color(color);
    const accentCol = themeCol.clone().lerp(new THREE.Color(0xffffff), 0.35);

    const colorizeModel = (obj: THREE.Object3D) => {
      let idx = 0;
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const col = idx % 3 === 2 ? accentCol : themeCol;
          idx++;
          const tinted = col.clone();
          mesh.material = new THREE.MeshToonMaterial({
            color: tinted,
            emissive: tinted.clone().multiplyScalar(0.15),
          });
        }
      });
    };

    const loadAndShow = (path: string) => {
      const loader = new GLTFLoader();
      loader.load(
        path,
        (gltf) => {
          modelObj = gltf.scene;
          colorizeModel(modelObj);
          const box = new THREE.Box3().setFromObject(modelObj);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          modelObj.scale.setScalar(2.2 / maxDim);
          modelObj.position.sub(center.multiplyScalar(2.2 / maxDim));
          modelObj.position.y += 0.15;
          scene.add(modelObj);
          scene.remove(fallbackMesh);
        },
        undefined,
        () => {
          if (path !== modelPath) loadAndShow(modelPath);
        }
      );
    };

    const charId = modelPath.replace('/models/', '').replace('.glb', '');
    loadAndShow(`/models/${charId}/rigged.glb`);

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      angle += 0.008;
      const target = modelObj || fallbackMesh;
      target.rotation.y = angle;
      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = {
      cleanup: () => {
        cancelAnimationFrame(rafId);
        renderer.dispose();
      }
    };
    return () => sceneRef.current?.cleanup();
  }, [modelPath, color]);

  return <canvas ref={canvasRef} style={{ width: 200, height: 260 }} />;
};

// ── Matchup badge ─────────────────────────────────────────────────────────────

const MatchupBadge = ({ selected, opponent }: { selected: CharacterType; opponent: CharacterType }) => {
  const mult = getRpsMultiplier(selected, opponent);
  if (mult === 1.0) return <span className="text-white/40 text-xs">Neutral matchup</span>;
  const good = mult > 1.0;
  return (
    <div className={`text-xs font-bold px-3 py-1 rounded-full ${good ? 'bg-green-500/30 text-green-300' : 'bg-red-500/30 text-red-300'}`}>
      {good ? `+35% advantage vs ${CHARACTERS[opponent].name}` : `-25% disadvantage vs ${CHARACTERS[opponent].name}`}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

const CharacterSelect: React.FC<Props> = ({
  side,
  selected,
  onSelect,
  opponent,
  onConfirm,
  confirmLabel = 'Confirm',
}) => {
  const [hovered, setHovered] = useState<CharacterType | null>(null);
  const preview = hovered ?? selected;
  const char    = CHARACTERS[preview];

  const sideLabel = side === 1 ? 'Player 1' : side === 2 ? 'Player 2' : 'Character';

  return (
    <div
      className="flex flex-col items-center gap-4 p-6 rounded-2xl text-white"
      style={{
        background: 'rgba(10,10,30,0.85)',
        backdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.1)',
        minWidth: 480,
        maxWidth: 560,
      }}
    >
      <h2 className="text-lg font-bold tracking-widest uppercase opacity-70">{sideLabel} Select</h2>

      {/* Character grid */}
      <div className="grid grid-cols-3 gap-2 w-full">
        {CHARACTER_LIST.map((c) => {
          const isSelected = selected === c.id;
          const isHovered  = hovered === c.id;
          return (
            <button
              key={c.id}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelect(c.id)}
              className="relative flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-150"
              style={{
                background: isSelected
                  ? `${c.themeColor}33`
                  : isHovered
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(255,255,255,0.03)',
                border: isSelected
                  ? `2px solid ${c.themeColor}`
                  : '2px solid transparent',
              }}
            >
              {/* Color swatch thumbnail */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-black"
                style={{ background: `${c.themeColor}55`, color: c.themeColor }}
              >
                {c.name[0]}
              </div>
              <span className="text-xs font-semibold">{c.name}</span>
              {isSelected && (
                <div
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px]"
                  style={{ background: c.themeColor }}
                >
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      <div className="flex gap-5 w-full mt-1">
        {/* 3-D model preview */}
        <div
          className="rounded-xl overflow-hidden flex-shrink-0"
          style={{ background: `${char.themeColor}15`, border: `1px solid ${char.themeColor}33` }}
        >
          <ModelPreview modelPath={char.modelPath} color={char.themeColor} />
        </div>

        {/* Info */}
        <div className="flex flex-col gap-3 flex-1 justify-between">
          <div>
            <div className="text-xl font-black" style={{ color: char.themeColor }}>{char.name}</div>
            <div className="text-xs opacity-60 italic mb-2">{char.tagline}</div>
            <p className="text-xs opacity-50 leading-relaxed">{char.description}</p>
          </div>

          {/* Stats */}
          <div className="flex flex-col gap-1.5">
            {STAT_LABELS.map(({ key, label, invert }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] opacity-50 w-16 text-right">{label}</span>
                <StatBar value={char.stats[key]} invert={invert} color={char.themeColor} />
              </div>
            ))}
          </div>

          {/* RPS matchup */}
          <div className="flex flex-col gap-1 text-xs opacity-60">
            <div>
              Strong vs:{' '}
              {char.strongAgainst.map((id) => (
                <span key={id} className="text-green-400 font-semibold mr-1">{CHARACTERS[id].name}</span>
              ))}
            </div>
            <div>
              Weak vs:{' '}
              {char.weakAgainst.map((id) => (
                <span key={id} className="text-red-400 font-semibold mr-1">{CHARACTERS[id].name}</span>
              ))}
            </div>
          </div>

          {/* Live matchup badge when opponent is known */}
          {opponent && <MatchupBadge selected={selected} opponent={opponent} />}
        </div>
      </div>

      <button
        onClick={onConfirm}
        className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all duration-150 hover:scale-[1.02] active:scale-95"
        style={{
          background: `linear-gradient(135deg, ${CHARACTERS[selected].themeColor}, ${CHARACTERS[selected].accentColor})`,
          color: '#fff',
          textShadow: '0 1px 3px rgba(0,0,0,0.5)',
        }}
      >
        {confirmLabel} — {CHARACTERS[selected].name}
      </button>
    </div>
  );
};

export default CharacterSelect;
