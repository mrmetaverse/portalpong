'use client'

import React from 'react';
import PortalPongGame, { PortalPongConfig, PortalPongConfigPreset } from './PortalPongGame';

const randomSeed = () => Math.floor(Math.random() * 1_000_000);
const randomRoomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const presetLabels: Record<PortalPongConfigPreset, string> = {
  light: 'Light',
  normal: 'Normal',
  chaos: 'Chaos'
};

const backgrounds: PortalPongConfig['background'][] = [
  'random',
  'bg1',
  'bg2',
  'bg3',
  'bg4',
  'bg5',
  'bg6',
  'bg7'
];

type MenuStep = 'level' | 'color' | 'matchmaking';

const RetroPanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="w-full max-w-4xl border border-cyan-200/40 bg-slate-900/35 p-4 shadow-[0_0_24px_rgba(34,211,238,0.18)] backdrop-blur-md">
    <div className="mb-4 border-b border-cyan-100/20 pb-2">
      <h2 className="text-xl font-bold uppercase tracking-wider text-cyan-100 drop-shadow-[0_0_8px_rgba(165,243,252,0.45)]">{title}</h2>
    </div>
    {children}
  </div>
);

const GameLoader: React.FC = () => {
  const [launchGame, setLaunchGame] = React.useState(false);
  const [menuStep, setMenuStep] = React.useState<MenuStep>('level');
  const [parallaxX, setParallaxX] = React.useState(0);
  const [parallaxY, setParallaxY] = React.useState(0);
  const [portalConfig, setPortalConfig] = React.useState<PortalPongConfig>({
    background: 'random',
    preset: 'normal',
    parallax: true,
    seed: randomSeed(),
    aiDifficulty: 1,
    mode: 'ai',
    localPlayer: 'player1',
    matchmakingRoom: ''
  });
  const [joinRoomCode, setJoinRoomCode] = React.useState('');

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const side = params.get('side');
    if (!room) {
      return;
    }
    setPortalConfig((prev) => ({
      ...prev,
      mode: 'matchmaking',
      matchmakingRoom: room.toUpperCase(),
      localPlayer: side === 'player2' ? 'player2' : 'player1'
    }));
    setJoinRoomCode(room.toUpperCase());
    setMenuStep('matchmaking');
  }, []);

  if (launchGame) {
    return (
      <PortalPongGame
        config={portalConfig}
        onExit={() => setLaunchGame(false)}
      />
    );
  }

  const updateConfig = <K extends keyof PortalPongConfig>(key: K, value: PortalPongConfig[K]) => {
    setPortalConfig((prev) => ({ ...prev, [key]: value }));
  };

  const launchPortalPong = () => setLaunchGame(true);

  const createMatch = async () => {
    const roomCode = randomRoomCode();
    setPortalConfig((prev) => ({
      ...prev,
      mode: 'matchmaking',
      localPlayer: 'player1',
      matchmakingRoom: roomCode
    }));
    setJoinRoomCode(roomCode);
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}&side=player2`;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch (error) {
      // Clipboard is optional, match still works.
    }
    launchPortalPong();
  };

  const joinMatch = () => {
    const roomCode = joinRoomCode.trim().toUpperCase();
    if (!roomCode) {
      return;
    }
    setPortalConfig((prev) => ({
      ...prev,
      mode: 'matchmaking',
      localPlayer: 'player2',
      matchmakingRoom: roomCode
    }));
    launchPortalPong();
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-slate-950 text-white flex flex-col items-center justify-center p-4 font-mono"
      onMouseMove={(e) => {
        const target = e.currentTarget.getBoundingClientRect();
        const nx = (e.clientX - target.left) / target.width - 0.5;
        const ny = (e.clientY - target.top) / target.height - 0.5;
        setParallaxX(nx);
        setParallaxY(ny);
      }}
      onMouseLeave={() => {
        setParallaxX(0);
        setParallaxY(0);
      }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-[-8%] opacity-85"
          style={{
            backgroundImage: "url('/bg4.png')",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundSize: 'cover',
            transform: `translate(${parallaxX * 8}px, ${parallaxY * 8}px) scale(1.16)`
          }}
        />
        <div
          className="absolute inset-[-10%] opacity-30 mix-blend-screen"
          style={{
            backgroundImage: "url('/bg4.png')",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundSize: 'cover',
            filter: 'blur(1.5px)',
            transform: `translate(${parallaxX * 18}px, ${parallaxY * 14}px) scale(1.22)`
          }}
        />
        <div
          className="absolute inset-0 bg-black/45"
          style={{
            background:
              'radial-gradient(circle at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.58) 70%, rgba(0,0,0,0.86) 100%)'
          }}
        />
      </div>
      <div className="relative z-10 w-full flex flex-col items-center">
        <h1 className="text-4xl md:text-6xl font-bold text-yellow-300 mb-2 text-center uppercase tracking-widest">
          PortalPong
        </h1>
        <p className="mb-6 text-xs md:text-sm text-slate-200 text-center max-w-2xl uppercase tracking-wide">
          Retro Arena Launcher
        </p>
      <div className="mb-6 flex gap-2 text-xs uppercase rounded-lg border border-white/10 bg-slate-900/25 px-2 py-2 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setMenuStep('level')}
          className={`border px-3 py-1 transition-colors ${menuStep === 'level' ? 'border-cyan-200/80 bg-cyan-300/15 text-cyan-100' : 'border-white/20 bg-white/5 text-slate-200 hover:bg-white/10'}`}
        >
          Level Select
        </button>
        <button
          type="button"
          onClick={() => setMenuStep('color')}
          className={`border px-3 py-1 transition-colors ${menuStep === 'color' ? 'border-cyan-200/80 bg-cyan-300/15 text-cyan-100' : 'border-white/20 bg-white/5 text-slate-200 hover:bg-white/10'}`}
        >
          Color Select
        </button>
        <button
          type="button"
          onClick={() => setMenuStep('matchmaking')}
          className={`border px-3 py-1 transition-colors ${menuStep === 'matchmaking' ? 'border-cyan-200/80 bg-cyan-300/15 text-cyan-100' : 'border-white/20 bg-white/5 text-slate-200 hover:bg-white/10'}`}
        >
          Matchmaking
        </button>
      </div>
      {menuStep === 'level' ? (
        <RetroPanel title="Level Select">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-cyan-100 uppercase text-xs">Arena Background</span>
              <select
                className="border border-cyan-300/60 bg-slate-950 p-2 uppercase"
                value={portalConfig.background}
                onChange={(e) => updateConfig('background', e.target.value as PortalPongConfig['background'])}
              >
                {backgrounds.map((background) => (
                  <option key={background} value={background}>
                    {background === 'random' ? 'Random Rotation' : background.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-cyan-100 uppercase text-xs">Generation Preset</span>
              <select
                className="border border-cyan-300/60 bg-slate-950 p-2"
                value={portalConfig.preset}
                onChange={(e) => updateConfig('preset', e.target.value as PortalPongConfigPreset)}
              >
                {Object.entries(presetLabels).map(([preset, label]) => (
                  <option key={preset} value={preset}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-cyan-100 uppercase text-xs">Seed</span>
              <div className="flex gap-2">
                <input
                  className="w-full border border-cyan-300/60 bg-slate-950 p-2 text-xs"
                  inputMode="numeric"
                  value={portalConfig.seed}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    updateConfig('seed', Number.isNaN(parsed) ? 0 : parsed);
                  }}
                />
                <button
                  type="button"
                  className="border border-cyan-300/60 px-3 text-xs text-cyan-200 hover:bg-cyan-900/20"
                  onClick={() => updateConfig('seed', randomSeed())}
                >
                  Randomize
                </button>
              </div>
            </label>
            <label className="flex items-center gap-3 mt-6 text-sm">
              <input
                type="checkbox"
                checked={portalConfig.parallax}
                onChange={(e) => updateConfig('parallax', e.target.checked)}
              />
              <span className="text-cyan-100 uppercase text-xs">Parallax Depth</span>
            </label>
          </div>
          <div className="mt-4">
            <button
              type="button"
              className="border border-yellow-300 bg-yellow-300/10 px-4 py-2 text-yellow-200 uppercase tracking-wide hover:bg-yellow-300/20"
              onClick={() => setMenuStep('color')}
            >
              Next: Color Select
            </button>
          </div>
        </RetroPanel>
      ) : null}
      {menuStep === 'color' ? (
        <RetroPanel title="Color Select">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className={`border p-4 text-left uppercase ${portalConfig.localPlayer === 'player1' ? 'border-red-300 bg-red-900/20' : 'border-slate-600'}`}
              onClick={() => updateConfig('localPlayer', 'player1')}
            >
              Red Wizard
            </button>
            <button
              type="button"
              className={`border p-4 text-left uppercase ${portalConfig.localPlayer === 'player2' ? 'border-blue-300 bg-blue-900/20' : 'border-slate-600'}`}
              onClick={() => updateConfig('localPlayer', 'player2')}
            >
              Blue Wizard
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="border border-slate-500 px-4 py-2 uppercase text-xs"
              onClick={() => setMenuStep('level')}
            >
              Back
            </button>
            <button
              type="button"
              className="border border-yellow-300 bg-yellow-300/10 px-4 py-2 text-yellow-200 uppercase tracking-wide hover:bg-yellow-300/20"
              onClick={() => setMenuStep('matchmaking')}
            >
              Next: Matchmaking
            </button>
          </div>
        </RetroPanel>
      ) : null}
      {menuStep === 'matchmaking' ? (
        <RetroPanel title="Matchmaking">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-cyan-100 uppercase text-xs">Mode</span>
              <select
                className="border border-cyan-300/60 bg-slate-950 p-2"
                value={portalConfig.mode ?? 'ai'}
                onChange={(e) => updateConfig('mode', e.target.value as PortalPongConfig['mode'])}
              >
                <option value="ai">Play Vs AI</option>
                <option value="matchmaking">Create Or Join Match</option>
              </select>
            </label>
            <div className="flex flex-col gap-2 text-sm">
              <span className="text-cyan-100 uppercase text-xs">Join Existing</span>
              <div className="flex gap-2">
                <input
                  className="w-full border border-cyan-300/60 bg-slate-950 p-2 text-xs uppercase"
                  value={joinRoomCode}
                  onChange={(e) => setJoinRoomCode(e.target.value)}
                  placeholder="Room Code"
                />
                <button
                  type="button"
                  className="border border-emerald-500 px-3 text-emerald-200 hover:bg-emerald-900/30 uppercase text-xs"
                  onClick={joinMatch}
                >
                  Join
                </button>
              </div>
            </div>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-cyan-100 uppercase text-xs">AI Difficulty ({portalConfig.aiDifficulty ?? 3}/10)</span>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={portalConfig.aiDifficulty ?? 3}
                onChange={(e) => updateConfig('aiDifficulty', Number.parseInt(e.target.value, 10))}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="border border-sky-500 px-4 py-2 text-sky-200 hover:bg-sky-900/30 uppercase text-xs"
              onClick={createMatch}
            >
              Create Match
            </button>
            <button
              type="button"
              className="border border-yellow-300 bg-yellow-300/10 px-4 py-2 text-yellow-200 uppercase tracking-wide hover:bg-yellow-300/20"
              onClick={launchPortalPong}
            >
              Start Match
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-300 uppercase">
            SpyGame mode coming soon.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Controls: WASD move and jump, click to cast wand blast.
          </p>
        </RetroPanel>
      ) : null}
      </div>
    </div>
  );
};

export default GameLoader;

