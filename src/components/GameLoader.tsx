'use client'

import React from 'react';
import PortalPongGame, { PortalPongConfig, PortalPongConfigPreset, WizardColorKey, MatchResult } from './PortalPongGame';
import LobbyScreen, { PlayerProfile } from './LobbyScreen';
import CharacterSelect from './CharacterSelect';
import { CharacterType } from '../data/characters';

// ─── Player identity (persisted to localStorage) ──────────────────────────────

const getOrCreatePlayerId = (): string => {
  if (typeof window === 'undefined') return 'anon';
  let id = localStorage.getItem('pp_player_id');
  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('pp_player_id', id);
  }
  return id;
};

const loadLocalProfile = (): PlayerProfile => {
  const id = getOrCreatePlayerId();
  try {
    const saved = localStorage.getItem('pp_profile');
    if (saved) { const p = JSON.parse(saved); return { ...p, id }; }
  } catch { /* ignore */ }
  return { id, username: 'Player', color: 'cyan' };
};

const saveLocalProfile = (p: PlayerProfile) => {
  try { localStorage.setItem('pp_profile', JSON.stringify(p)); } catch { /* ignore */ }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const randomSeed = () => Math.floor(Math.random() * 1_000_000);
const randomRoomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const presetLabels: Record<PortalPongConfigPreset, string> = { light: 'Light', normal: 'Normal', chaos: 'Chaos' };
const backgrounds: PortalPongConfig['background'][] = ['random', 'bg1', 'bg2', 'bg3', 'bg4', 'bg5', 'bg6', 'bg7'];
const wizardColorOptions: Array<{ key: WizardColorKey; label: string; preview: string }> = [
  { key: 'teal', label: 'Teal', preview: '#14b8a6' },
  { key: 'cyan', label: 'Cyan', preview: '#22d3ee' },
  { key: 'lavender', label: 'Lavender', preview: '#c4b5fd' },
  { key: 'darkPurple', label: 'Dark Purple', preview: '#6d28d9' },
  { key: 'red', label: 'Red', preview: '#ef4444' },
  { key: 'blue', label: 'Blue', preview: '#3b82f6' },
  { key: 'yellow', label: 'Yellow', preview: '#facc15' },
  { key: 'orange', label: 'Orange', preview: '#f97316' }
];

type MenuStep = 'level' | 'color' | 'character' | 'ai';

const RetroPanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="w-full max-w-4xl border border-cyan-200/40 bg-slate-900/35 p-4 shadow-[0_0_24px_rgba(34,211,238,0.18)] backdrop-blur-md">
    <div className="mb-4 border-b border-cyan-100/20 pb-2">
      <h2 className="text-xl font-bold uppercase tracking-wider text-cyan-100 drop-shadow-[0_0_8px_rgba(165,243,252,0.45)]">{title}</h2>
    </div>
    {children}
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

const GameLoader: React.FC = () => {
  const [player, setPlayer] = React.useState<PlayerProfile>(loadLocalProfile);
  const [launchGame, setLaunchGame] = React.useState(false);
  const [showLobby, setShowLobby] = React.useState(false);
  const [menuStep, setMenuStep] = React.useState<MenuStep>('level');
  const [p1Character, setP1Character] = React.useState<CharacterType>('wizard');
  const [p2Character, setP2Character] = React.useState<CharacterType>('wizard');
  const [parallaxX, setParallaxX] = React.useState(0);
  const [parallaxY, setParallaxY] = React.useState(0);
  const [pendingMatchInfo, setPendingMatchInfo] = React.useState<{ roomCode: string; side: 'player1' | 'player2'; player1Id: string; player2Id: string } | null>(null);
  const [portalConfig, setPortalConfig] = React.useState<PortalPongConfig>({
    background: 'random', preset: 'normal', parallax: true,
    seed: randomSeed(), player1Color: 'cyan', player2Color: 'lavender',
    aiDifficulty: 1, mode: 'ai', localPlayer: 'player1', matchmakingRoom: '',
    player1Id: '', player2Id: ''
  });

  // Hydrate player config from saved profile
  React.useEffect(() => {
    const p = loadLocalProfile();
    setPlayer(p);
    setPortalConfig(prev => ({ ...prev, player1Color: p.color as WizardColorKey, player1Id: p.id }));
  }, []);

  // Handle URL params (direct room link)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const side = params.get('side');
    if (!room) return;
    setPortalConfig(prev => ({
      ...prev, mode: 'matchmaking', matchmakingRoom: room.toUpperCase(),
      localPlayer: side === 'player2' ? 'player2' : 'player1'
    }));
    setShowLobby(true);
  }, []);

  const handlePlayerUpdate = (p: PlayerProfile) => {
    setPlayer(p);
    saveLocalProfile(p);
    setPortalConfig(prev => ({ ...prev, player1Color: p.color as WizardColorKey, player1Id: p.id }));
  };

  // Submit match result to backend
  const submitMatchResult = async (result: MatchResult) => {
    if (!result.player1Id) return;
    try {
      await fetch('/api/match/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      });
      // Refresh local stats
      const res = await fetch(`/api/player?id=${result.player1Id}`);
      const data = await res.json();
      if (data.ok && data.player) {
        const updated = { ...player, ...data.player };
        setPlayer(updated);
        saveLocalProfile(updated);
      }
    } catch { /* non-critical */ }
  };

  const handleMatchEnd = (result: MatchResult) => {
    submitMatchResult(result);
  };

  // Launch from lobby
  const handleLobbyLaunch = (config: PortalPongConfig, matchInfo: typeof pendingMatchInfo) => {
    const withIds = {
      ...config,
      player1Id: matchInfo?.player1Id || player.id,
      player2Id: matchInfo?.player2Id || ''
    };
    setPortalConfig(withIds);
    setPendingMatchInfo(matchInfo);
    setShowLobby(false);
    setLaunchGame(true);
  };

  const updateConfig = <K extends keyof PortalPongConfig>(key: K, value: PortalPongConfig[K]) =>
    setPortalConfig(prev => ({ ...prev, [key]: value }));

  // AI match launch
  const launchVsAi = () => {
    setPortalConfig(prev => ({
      ...prev, mode: 'ai',
      player1Id: player.id, player2Id: '',
      player1Character: p1Character,
      player2Character: p2Character
    }));
    setLaunchGame(true);
  };

  if (launchGame) {
    return (
      <PortalPongGame
        config={portalConfig}
        onExit={() => { setLaunchGame(false); setPendingMatchInfo(null); }}
        onMatchEnd={handleMatchEnd}
      />
    );
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-slate-950 text-white flex flex-col items-center justify-center p-4 font-mono"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setParallaxX((e.clientX - r.left) / r.width - 0.5);
        setParallaxY((e.clientY - r.top) / r.height - 0.5);
      }}
      onMouseLeave={() => { setParallaxX(0); setParallaxY(0); }}
    >
      {/* Background layers */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-[-8%] opacity-85"
          style={{ backgroundImage: "url('/bg4.png')", backgroundSize: 'cover', backgroundPosition: 'center', transform: `translate(${parallaxX * 8}px, ${parallaxY * 8}px) scale(1.16)` }} />
        <div className="absolute inset-[-10%] opacity-30 mix-blend-screen"
          style={{ backgroundImage: "url('/bg4.png')", backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(1.5px)', transform: `translate(${parallaxX * 18}px, ${parallaxY * 14}px) scale(1.22)` }} />
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(circle at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.58) 70%, rgba(0,0,0,0.86) 100%)' }} />
      </div>

      <div className="relative z-10 w-full flex flex-col items-center">
        <h1 className="text-4xl md:text-6xl font-bold text-yellow-300 mb-1 text-center uppercase tracking-widest">PortalPong</h1>
        <p className="mb-5 text-xs md:text-sm text-slate-200 text-center max-w-2xl uppercase tracking-wide">Retro Arena Launcher</p>

        {/* Tab nav */}
        <div className="mb-5 flex gap-2 text-xs uppercase rounded-lg border border-white/10 bg-slate-900/25 px-2 py-2 backdrop-blur-sm flex-wrap justify-center">
          {(['level', 'color', 'character', 'ai'] as MenuStep[]).map(step => (
            <button key={step} type="button" onClick={() => setMenuStep(step)}
              className={`border px-3 py-1 transition-colors ${menuStep === step ? 'border-cyan-200/80 bg-cyan-300/15 text-cyan-100' : 'border-white/20 bg-white/5 text-slate-200 hover:bg-white/10'}`}>
              {step === 'ai' ? 'AI Match' : step === 'level' ? 'Level' : step === 'color' ? 'Colors' : 'Characters'}
            </button>
          ))}
          <button type="button" onClick={() => setShowLobby(true)}
            className="border border-violet-400/60 bg-violet-900/15 text-violet-200 px-3 py-1 transition-colors hover:bg-violet-900/30">
            Multiplayer
          </button>
        </div>

        {/* Level select */}
        {menuStep === 'level' && (
          <RetroPanel title="Level Select">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-cyan-100 uppercase text-xs">Arena Background</span>
                <select className="border border-cyan-300/60 bg-slate-950 p-2 uppercase"
                  value={portalConfig.background}
                  onChange={(e) => updateConfig('background', e.target.value as PortalPongConfig['background'])}>
                  {backgrounds.map((bg) => (
                    <option key={bg} value={bg}>{bg === 'random' ? 'Random Rotation' : bg.toUpperCase()}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-cyan-100 uppercase text-xs">Generation Preset</span>
                <select className="border border-cyan-300/60 bg-slate-950 p-2"
                  value={portalConfig.preset}
                  onChange={(e) => updateConfig('preset', e.target.value as PortalPongConfigPreset)}>
                  {Object.entries(presetLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-cyan-100 uppercase text-xs">Seed</span>
                <div className="flex gap-2">
                  <input className="w-full border border-cyan-300/60 bg-slate-950 p-2 text-xs" inputMode="numeric"
                    value={portalConfig.seed}
                    onChange={(e) => { const n = Number.parseInt(e.target.value, 10); updateConfig('seed', Number.isNaN(n) ? 0 : n); }} />
                  <button type="button" className="border border-cyan-300/60 px-3 text-xs text-cyan-200 hover:bg-cyan-900/20"
                    onClick={() => updateConfig('seed', randomSeed())}>Randomize</button>
                </div>
              </label>
              <label className="flex items-center gap-3 mt-6 text-sm">
                <input type="checkbox" checked={portalConfig.parallax} onChange={(e) => updateConfig('parallax', e.target.checked)} />
                <span className="text-cyan-100 uppercase text-xs">Parallax Depth</span>
              </label>
            </div>
            <div className="mt-4">
              <button type="button" className="border border-yellow-300 bg-yellow-300/10 px-4 py-2 text-yellow-200 uppercase tracking-wide hover:bg-yellow-300/20"
                onClick={() => setMenuStep('color')}>Next: Colors</button>
            </div>
          </RetroPanel>
        )}

        {/* Color select */}
        {menuStep === 'color' && (
          <RetroPanel title="Color Select">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-cyan-100 uppercase text-xs">Left Wizard Color</span>
                <select className="border border-cyan-300/60 bg-slate-950 p-2 uppercase"
                  value={portalConfig.player1Color ?? 'cyan'}
                  onChange={(e) => updateConfig('player1Color', e.target.value as WizardColorKey)}>
                  {wizardColorOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-cyan-100 uppercase text-xs">Right Wizard Color</span>
                <select className="border border-cyan-300/60 bg-slate-950 p-2 uppercase"
                  value={portalConfig.player2Color ?? 'lavender'}
                  onChange={(e) => updateConfig('player2Color', e.target.value as WizardColorKey)}>
                  {wizardColorOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {wizardColorOptions.map(o => (
                <div key={o.key} className="flex items-center gap-2 border border-white/15 bg-slate-950/40 px-2 py-1 text-[10px] uppercase text-slate-300">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: o.preview }} />{o.label}
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="border border-slate-500 px-4 py-2 uppercase text-xs" onClick={() => setMenuStep('level')}>Back</button>
              <button type="button" className="border border-yellow-300 bg-yellow-300/10 px-4 py-2 text-yellow-200 uppercase tracking-wide hover:bg-yellow-300/20"
                onClick={() => setMenuStep('character')}>Next: Characters</button>
            </div>
          </RetroPanel>
        )}

        {/* Character select */}
        {menuStep === 'character' && (
          <div className="flex flex-col md:flex-row gap-6 items-start justify-center">
            <CharacterSelect
              side={1}
              selected={p1Character}
              onSelect={setP1Character}
              opponent={p2Character}
              onConfirm={() => setMenuStep('ai')}
              confirmLabel="Lock In P1"
            />
            <CharacterSelect
              side={2}
              selected={p2Character}
              onSelect={setP2Character}
              opponent={p1Character}
              onConfirm={() => setMenuStep('ai')}
              confirmLabel="Lock In P2"
            />
          </div>
        )}

        {/* AI match */}
        {menuStep === 'ai' && (
          <RetroPanel title="Play vs AI">
            <div className="grid gap-4 md:grid-cols-2 mb-4">
              <label className="flex flex-col gap-2 text-sm col-span-2">
                <span className="text-cyan-100 uppercase text-xs">AI Difficulty ({portalConfig.aiDifficulty ?? 3}/10)</span>
                <input type="range" min={1} max={10} step={1} value={portalConfig.aiDifficulty ?? 3}
                  onChange={(e) => updateConfig('aiDifficulty', Number.parseInt(e.target.value, 10))} />
                <div className="flex justify-between text-[10px] text-slate-400 uppercase">
                  <span>Easy</span><span>Medium</span><span>Hard</span>
                </div>
              </label>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <button type="button" className="border border-slate-500 px-4 py-2 uppercase text-xs" onClick={() => setMenuStep('color')}>Back</button>
              <button type="button"
                className="border border-yellow-300 bg-yellow-300/10 px-6 py-2 text-yellow-200 uppercase tracking-wide hover:bg-yellow-300/20 font-bold"
                onClick={launchVsAi}>
                Start vs AI
              </button>
              <button type="button"
                className="border border-violet-400/60 bg-violet-900/10 px-6 py-2 text-violet-200 uppercase tracking-wide hover:bg-violet-900/30 font-bold"
                onClick={() => setShowLobby(true)}>
                Multiplayer
              </button>
            </div>

            {/* Quick stats */}
            {(player.wins || player.pvpWins) ? (
              <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[11px]">
                {[
                  ['W', player.wins], ['L', player.losses], ['Goals', player.goalsFor],
                  ['PvP W', player.pvpWins]
                ].map(([label, val]) => (
                  <div key={String(label)} className="border border-white/10 bg-slate-900/30 py-2">
                    <div className="text-slate-400 text-[9px] uppercase">{label}</div>
                    <div className="text-white font-bold">{Number(val) || 0}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </RetroPanel>
        )}

        <p className="mt-4 text-[10px] text-slate-500 uppercase tracking-widest">
          Playing as: <span className="text-cyan-400">{player.username}</span>
        </p>
      </div>

      {/* Lobby overlay */}
      {showLobby && (
        <LobbyScreen
          player={player}
          onPlayerUpdate={handlePlayerUpdate}
          onClose={() => setShowLobby(false)}
          onLaunch={handleLobbyLaunch}
        />
      )}
    </div>
  );
};

// Keep legacy createMatch/joinMatch for URL-based joining
const _randomRoomCode = randomRoomCode;
void _randomRoomCode;

export default GameLoader;
