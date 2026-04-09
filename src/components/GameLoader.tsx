'use client';

import React from 'react';
import PortalPongGame, {
  PortalPongConfig,
  PortalPongConfigPreset,
  WizardColorKey,
  MatchResult,
} from './PortalPongGame';
import LobbyScreen, { PlayerProfile } from './LobbyScreen';
import CharacterSelect from './CharacterSelect';
import LevelPreview from './LevelPreview';
import { CharacterType } from '../data/characters';

// ─── Player identity ──────────────────────────────────────────────────────────

const getOrCreatePlayerId = (): string => {
  if (typeof window === 'undefined') return 'anon';
  let id = localStorage.getItem('pp_player_id');
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
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
    if (saved) {
      const p = JSON.parse(saved);
      return { ...p, id };
    }
  } catch { /* ignore */ }
  return { id, username: 'Player', color: 'cyan' };
};

const saveLocalProfile = (p: PlayerProfile) => {
  try { localStorage.setItem('pp_profile', JSON.stringify(p)); } catch { /* ignore */ }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const randomSeed = () => Math.floor(Math.random() * 1_000_000);

const presetLabels: Record<PortalPongConfigPreset, string> = {
  light: 'Light', normal: 'Normal', chaos: 'Chaos',
};
const presetDescriptions: Record<PortalPongConfigPreset, string> = {
  light: 'Few platforms, open arena',
  normal: 'Balanced layout',
  chaos: 'Dense, unpredictable',
};
const backgrounds: PortalPongConfig['background'][] = [
  'random', 'bg1', 'bg2', 'bg3', 'bg4', 'bg5', 'bg6', 'bg7',
];
const wizardColorOptions: Array<{ key: WizardColorKey; label: string; hex: string }> = [
  { key: 'teal',       label: 'Teal',        hex: '#14b8a6' },
  { key: 'cyan',       label: 'Cyan',        hex: '#22d3ee' },
  { key: 'lavender',   label: 'Lavender',    hex: '#c4b5fd' },
  { key: 'darkPurple', label: 'Dark Purple', hex: '#6d28d9' },
  { key: 'red',        label: 'Red',         hex: '#ef4444' },
  { key: 'blue',       label: 'Blue',        hex: '#3b82f6' },
  { key: 'yellow',     label: 'Yellow',      hex: '#facc15' },
  { key: 'orange',     label: 'Orange',      hex: '#f97316' },
];

// ─── Flow types ───────────────────────────────────────────────────────────────

/** The high-level mode the player chose on the home screen */
type PlayMode = 'ai' | 'create' | 'join-code' | 'browse' | 'auto-match';

/** Steps in the wizard */
type WizardStep = 'mode' | 'character' | 'level' | 'lobby';

// ─── Small UI pieces ──────────────────────────────────────────────────────────

const StepDots: React.FC<{ steps: WizardStep[]; current: WizardStep }> = ({ steps, current }) => (
  <div className="flex items-center gap-2 mb-6">
    {steps.map((s, i) => (
      <React.Fragment key={s}>
        <div
          className={`w-2 h-2 rounded-full transition-all ${
            s === current ? 'bg-cyan-400 scale-125' : 'bg-white/20'
          }`}
        />
        {i < steps.length - 1 && <div className="w-6 h-px bg-white/10" />}
      </React.Fragment>
    ))}
  </div>
);

const ModeButton: React.FC<{
  icon: string;
  label: string;
  sub: string;
  onClick: () => void;
  accent?: string;
}> = ({ icon, label, sub, onClick, accent = '#22d3ee' }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-start gap-4 w-full p-4 rounded-xl text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
    style={{
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${accent}33`,
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${accent}10`; }}
    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; }}
  >
    <span className="text-2xl leading-none mt-0.5">{icon}</span>
    <div>
      <div className="font-bold text-sm text-white">{label}</div>
      <div className="text-xs text-white/40 mt-0.5">{sub}</div>
    </div>
  </button>
);

// ─── Level Config + Preview panel ────────────────────────────────────────────

interface LevelPanelProps {
  config: PortalPongConfig;
  mode: PlayMode;
  onChange: <K extends keyof PortalPongConfig>(k: K, v: PortalPongConfig[K]) => void;
  onConfirm: () => void;
  onBack: () => void;
  confirmLabel: string;
}

const LevelPanel: React.FC<LevelPanelProps> = ({
  config, mode, onChange, onConfirm, onBack, confirmLabel,
}) => {
  const [localSeed, setLocalSeed] = React.useState(String(config.seed));
  const [livePreview, setLivePreview] = React.useState(false);

  const commitSeed = () => {
    const n = Number.parseInt(localSeed, 10);
    onChange('seed', Number.isNaN(n) ? randomSeed() : n);
  };

  const reroll = () => {
    const s = randomSeed();
    setLocalSeed(String(s));
    onChange('seed', s);
  };

  return (
    <div
      className="flex flex-col gap-5 rounded-2xl p-6 w-full max-w-2xl text-white"
      style={{
        background: 'rgba(10,10,30,0.85)',
        backdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold uppercase tracking-widest opacity-70">Level Select</h2>
        {mode === 'ai' && (
          <label className="flex items-center gap-2 text-xs opacity-60">
            <input type="checkbox" checked={config.parallax}
              onChange={e => onChange('parallax', e.target.checked)} />
            Parallax depth
          </label>
        )}
      </div>

      {/* Preset */}
      <div>
        <div className="text-xs opacity-50 uppercase mb-2">Arena Density</div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(presetLabels) as PortalPongConfigPreset[]).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => onChange('preset', p)}
              className="py-2 px-3 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: config.preset === p ? 'rgba(34,211,238,0.25)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${config.preset === p ? '#22d3ee' : 'rgba(255,255,255,0.1)'}`,
                color: config.preset === p ? '#22d3ee' : 'rgba(255,255,255,0.6)',
              }}
            >
              <div>{presetLabels[p]}</div>
              <div className="text-[10px] font-normal opacity-60 mt-0.5">{presetDescriptions[p]}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Seed row */}
      <div className="flex gap-2 items-center">
        <div className="flex-1">
          <div className="text-xs opacity-50 uppercase mb-1">Arena Seed</div>
          <input
            className="w-full rounded-lg px-3 py-2 text-sm bg-white/5 border border-white/10 text-white"
            inputMode="numeric"
            value={localSeed}
            onChange={e => setLocalSeed(e.target.value)}
            onBlur={commitSeed}
            onKeyDown={e => { if (e.key === 'Enter') commitSeed(); }}
          />
        </div>
        <button
          type="button"
          onClick={reroll}
          className="mt-5 px-3 py-2 rounded-lg text-xs font-semibold uppercase border border-white/20 hover:bg-white/10 transition-all"
        >
          Reroll
        </button>
        <button
          type="button"
          onClick={() => setLivePreview(v => !v)}
          className="mt-5 px-3 py-2 rounded-lg text-xs font-semibold uppercase border transition-all"
          style={{
            borderColor: livePreview ? '#22d3ee' : 'rgba(255,255,255,0.2)',
            color: livePreview ? '#22d3ee' : 'rgba(255,255,255,0.6)',
            background: livePreview ? 'rgba(34,211,238,0.1)' : 'transparent',
          }}
        >
          Preview
        </button>
      </div>

      {/* SVG layout preview */}
      <div>
        <LevelPreview seed={config.seed} preset={config.preset} width={432} height={200} />
      </div>

      {/* Background */}
      <div>
        <div className="text-xs opacity-50 uppercase mb-2">Background</div>
        <div className="flex flex-wrap gap-1.5">
          {backgrounds.map(bg => (
            <button
              key={bg}
              type="button"
              onClick={() => onChange('background', bg)}
              className="px-2 py-1 rounded text-xs uppercase border transition-all"
              style={{
                borderColor: config.background === bg ? '#22d3ee80' : 'rgba(255,255,255,0.1)',
                background: config.background === bg ? 'rgba(34,211,238,0.12)' : 'transparent',
                color: config.background === bg ? '#22d3ee' : 'rgba(255,255,255,0.4)',
              }}
            >
              {bg === 'random' ? 'Random' : bg.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* AI Difficulty (only vs AI) */}
      {mode === 'ai' && (
        <div>
          <div className="text-xs opacity-50 uppercase mb-1">
            AI Difficulty — {config.aiDifficulty ?? 3}/10
          </div>
          <input
            type="range" min={1} max={10} step={1}
            value={config.aiDifficulty ?? 3}
            onChange={e => onChange('aiDifficulty', Number.parseInt(e.target.value, 10))}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-white/30 uppercase mt-0.5">
            <span>Easy</span><span>Medium</span><span>Hard</span>
          </div>
        </div>
      )}

      {/* Confirm row */}
      <div className="flex gap-3 mt-1">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-lg border border-white/20 text-sm text-white/60 hover:bg-white/5 transition-all"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-widest bg-gradient-to-r from-cyan-500 to-violet-600 text-white hover:scale-[1.02] active:scale-95 transition-all"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const GameLoader: React.FC = () => {
  const [player, setPlayer] = React.useState<PlayerProfile>(loadLocalProfile);
  const [step, setStep] = React.useState<WizardStep>('mode');
  const [playMode, setPlayMode] = React.useState<PlayMode>('ai');
  const [launchGame, setLaunchGame] = React.useState(false);
  const [showLobby, setShowLobby] = React.useState(false);

  // Characters
  const [p1Character, setP1Character] = React.useState<CharacterType>('wizard');
  const [p2Character, setP2Character] = React.useState<CharacterType>('wizard');
  const [p1CharConfirmed, setP1CharConfirmed] = React.useState(false);

  // Colors
  const [p1Color, setP1Color] = React.useState<WizardColorKey>('cyan');
  const [p2Color, setP2Color] = React.useState<WizardColorKey>('lavender');

  // Parallax bg
  const [parallaxX, setParallaxX] = React.useState(0);
  const [parallaxY, setParallaxY] = React.useState(0);

  const [pendingMatchInfo, setPendingMatchInfo] = React.useState<{
    roomCode: string;
    side: 'player1' | 'player2';
    player1Id: string;
    player2Id: string;
  } | null>(null);

  const [portalConfig, setPortalConfig] = React.useState<PortalPongConfig>({
    background: 'random',
    preset: 'normal',
    parallax: true,
    seed: randomSeed(),
    player1Color: 'cyan',
    player2Color: 'lavender',
    aiDifficulty: 3,
    mode: 'ai',
    localPlayer: 'player1',
    matchmakingRoom: '',
    player1Id: '',
    player2Id: '',
    player1Character: 'wizard',
    player2Character: 'wizard',
  });

  // Hydrate from localStorage on mount
  React.useEffect(() => {
    const p = loadLocalProfile();
    setPlayer(p);
    setPortalConfig(prev => ({
      ...prev,
      player1Color: p.color as WizardColorKey,
      player1Id: p.id,
    }));
  }, []);

  // Handle URL params (direct room link)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const side = params.get('side');
    if (!room) return;
    setPortalConfig(prev => ({
      ...prev,
      mode: 'matchmaking',
      matchmakingRoom: room.toUpperCase(),
      localPlayer: side === 'player2' ? 'player2' : 'player1',
    }));
    setPlayMode('join-code');
    setStep('character');
    setShowLobby(true);
  }, []);

  const updateConfig = <K extends keyof PortalPongConfig>(key: K, value: PortalPongConfig[K]) =>
    setPortalConfig(prev => ({ ...prev, [key]: value }));

  const handlePlayerUpdate = (p: PlayerProfile) => {
    setPlayer(p);
    saveLocalProfile(p);
    setPortalConfig(prev => ({ ...prev, player1Color: p.color as WizardColorKey, player1Id: p.id }));
  };

  const submitMatchResult = async (result: MatchResult) => {
    if (!result.player1Id) return;
    try {
      await fetch('/api/match/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      const res = await fetch(`/api/player?id=${result.player1Id}`);
      const data = await res.json();
      if (data.ok && data.player) {
        const updated = { ...player, ...data.player };
        setPlayer(updated);
        saveLocalProfile(updated);
      }
    } catch { /* non-critical */ }
  };

  const handleMatchEnd = (result: MatchResult) => submitMatchResult(result);

  const handleLobbyLaunch = (
    config: PortalPongConfig,
    matchInfo: typeof pendingMatchInfo
  ) => {
    const withIds = {
      ...config,
      player1Id: matchInfo?.player1Id ?? player.id,
      player2Id: matchInfo?.player2Id ?? '',
      player1Character: p1Character,
      player2Character: p2Character,
    };
    setPortalConfig(withIds);
    setPendingMatchInfo(matchInfo);
    setShowLobby(false);
    setLaunchGame(true);
  };

  // ── Mode selection handlers ─────────────────────────────────────────────────

  const chooseMode = (m: PlayMode) => {
    setPlayMode(m);
    setP1CharConfirmed(false);
    setStep('character');
  };

  // ── Character confirm handlers ──────────────────────────────────────────────

  const handleCharConfirmAi = () => {
    // VS AI: both characters confirmed together, go to level
    setPortalConfig(prev => ({
      ...prev,
      player1Character: p1Character,
      player2Character: p2Character,
      player1Color: p1Color,
      player2Color: p2Color,
    }));
    setStep('level');
  };

  const handleCharConfirmOnline = () => {
    // Online: only P1 confirms their character, go to level (create) or lobby (join/queue)
    setPortalConfig(prev => ({
      ...prev,
      player1Character: p1Character,
      player1Color: p1Color,
      player1Id: player.id,
    }));
    if (playMode === 'create') {
      setStep('level');
    } else {
      // join/browse/auto-match — level was chosen by host or will be set by queue
      setStep('lobby');
      setShowLobby(true);
    }
  };

  // ── Level confirm ───────────────────────────────────────────────────────────

  const handleLevelConfirm = () => {
    if (playMode === 'ai') {
      setPortalConfig(prev => ({
        ...prev,
        mode: 'ai',
        player1Id: player.id,
        player2Id: '',
      }));
      setLaunchGame(true);
    } else {
      // 'create' — open lobby with configured game settings
      setShowLobby(true);
      setStep('lobby');
    }
  };

  // ── Wizard step list for current mode ──────────────────────────────────────

  const stepList: WizardStep[] = (() => {
    if (playMode === 'ai' || playMode === 'create') return ['mode', 'character', 'level'];
    return ['mode', 'character', 'lobby'];
  })();

  // ── Render ──────────────────────────────────────────────────────────────────

  if (launchGame) {
    return (
      <PortalPongGame
        config={portalConfig}
        onExit={() => { setLaunchGame(false); setPendingMatchInfo(null); setStep('mode'); }}
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
      {/* Parallax background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-[-8%] opacity-85" style={{
          backgroundImage: "url('/bg4.png')", backgroundSize: 'cover', backgroundPosition: 'center',
          transform: `translate(${parallaxX * 8}px, ${parallaxY * 8}px) scale(1.16)`,
        }} />
        <div className="absolute inset-[-10%] opacity-30 mix-blend-screen" style={{
          backgroundImage: "url('/bg4.png')", backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'blur(1.5px)',
          transform: `translate(${parallaxX * 18}px, ${parallaxY * 14}px) scale(1.22)`,
        }} />
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(circle at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.58) 70%, rgba(0,0,0,0.86) 100%)',
        }} />
      </div>

      <div className="relative z-10 w-full flex flex-col items-center">
        {/* Logo */}
        <h1 className="text-4xl md:text-6xl font-bold text-yellow-300 mb-1 text-center uppercase tracking-widest">
          PortalPong
        </h1>
        <p className="mb-6 text-xs md:text-sm text-slate-300 text-center max-w-2xl uppercase tracking-wide opacity-70">
          Retro Arena Launcher
        </p>

        {/* Step dots */}
        {step !== 'mode' && (
          <div className="mb-4">
            <StepDots steps={stepList} current={step} />
          </div>
        )}

        {/* ── STEP: MODE SELECT ─────────────────────────────────────────── */}
        {step === 'mode' && (
          <div
            className="w-full max-w-sm flex flex-col gap-3 p-6 rounded-2xl"
            style={{
              background: 'rgba(10,10,30,0.85)',
              backdropFilter: 'blur(18px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <h2 className="text-base font-bold uppercase tracking-widest opacity-70 mb-2 text-center">
              How do you want to play?
            </h2>

            <ModeButton
              icon="🤖"
              label="VS AI"
              sub="Single player — pick difficulty & arena"
              onClick={() => chooseMode('ai')}
              accent="#22d3ee"
            />
            <ModeButton
              icon="🏟️"
              label="Create Match"
              sub="Host a room — share code for your opponent to join"
              onClick={() => chooseMode('create')}
              accent="#a855f7"
            />
            <ModeButton
              icon="🔑"
              label="Join by Code"
              sub="Enter a room code from your opponent"
              onClick={() => chooseMode('join-code')}
              accent="#f97316"
            />
            <ModeButton
              icon="📋"
              label="Browse Public Rooms"
              sub="Browse open matches and jump in"
              onClick={() => chooseMode('browse')}
              accent="#22c55e"
            />
            <ModeButton
              icon="⚡"
              label="Auto-Match"
              sub="Get instantly matched with a random opponent"
              onClick={() => chooseMode('auto-match')}
              accent="#fbbf24"
            />

            {/* Player badge */}
            <div className="mt-2 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white/40">
              <span>Playing as <span className="text-cyan-400">{player.username}</span></span>
              {(player.wins || player.pvpWins) ? (
                <span className="text-white/30">
                  {Number(player.wins) || 0}W / {Number(player.losses) || 0}L
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* ── STEP: CHARACTER SELECT ────────────────────────────────────── */}
        {step === 'character' && (
          <div className="flex flex-col items-center gap-3 w-full">
            {/* Back button */}
            <button
              type="button"
              onClick={() => setStep('mode')}
              className="text-xs text-white/40 hover:text-white/70 uppercase tracking-widest mb-1 transition-all"
            >
              ← Back to mode select
            </button>

            {playMode === 'ai' ? (
              /* VS AI — show both P1 and P2 pickers side by side */
              <div className="flex flex-col lg:flex-row gap-4 items-start justify-center w-full">
                {/* P1 */}
                <div className="flex flex-col gap-2 items-center">
                  <ColorSwatches
                    selected={p1Color}
                    onSelect={setP1Color}
                    label="Your Color"
                  />
                  <CharacterSelect
                    side={1}
                    selected={p1Character}
                    onSelect={setP1Character}
                    opponent={p2Character}
                    onConfirm={() => setP1CharConfirmed(true)}
                    confirmLabel={p1CharConfirmed ? 'P1 Locked ✓' : 'Lock In P1'}
                  />
                </div>
                {/* P2 */}
                <div className="flex flex-col gap-2 items-center">
                  <ColorSwatches
                    selected={p2Color}
                    onSelect={setP2Color}
                    label="P2 Color"
                  />
                  <CharacterSelect
                    side={2}
                    selected={p2Character}
                    onSelect={setP2Character}
                    opponent={p1Character}
                    onConfirm={handleCharConfirmAi}
                    confirmLabel="Lock In P2 → Level"
                  />
                </div>
              </div>
            ) : (
              /* Online modes — only local player picks */
              <div className="flex flex-col gap-2 items-center">
                <ColorSwatches
                  selected={p1Color}
                  onSelect={setP1Color}
                  label="Your Color"
                />
                <CharacterSelect
                  selected={p1Character}
                  onSelect={setP1Character}
                  onConfirm={handleCharConfirmOnline}
                  confirmLabel={
                    playMode === 'create'
                      ? 'Confirm → Level Select'
                      : 'Confirm → Find Match'
                  }
                />
              </div>
            )}
          </div>
        )}

        {/* ── STEP: LEVEL SELECT ────────────────────────────────────────── */}
        {step === 'level' && (
          <LevelPanel
            config={portalConfig}
            mode={playMode}
            onChange={updateConfig}
            onConfirm={handleLevelConfirm}
            onBack={() => setStep('character')}
            confirmLabel={playMode === 'ai' ? 'Launch Match' : 'Create Room →'}
          />
        )}

        {/* If lobby step has no overlay (shouldn't happen, but fallback) */}
        {step === 'lobby' && !showLobby && (
          <button
            type="button"
            className="text-cyan-400 text-sm underline"
            onClick={() => setShowLobby(true)}
          >
            Open Lobby
          </button>
        )}
      </div>

      {/* Lobby overlay */}
      {showLobby && (
        <LobbyScreen
          player={player}
          onPlayerUpdate={handlePlayerUpdate}
          onClose={() => {
            setShowLobby(false);
            if (step === 'lobby') setStep('mode');
          }}
          onLaunch={handleLobbyLaunch}
          initialMode={playMode}
          preConfigured={portalConfig}
        />
      )}
    </div>
  );
};

// ─── Color swatches (compact row) ─────────────────────────────────────────────

const ColorSwatches: React.FC<{
  selected: WizardColorKey;
  onSelect: (k: WizardColorKey) => void;
  label: string;
}> = ({ selected, onSelect, label }) => (
  <div className="flex items-center gap-2 text-xs text-white/40 uppercase tracking-widest">
    <span>{label}:</span>
    <div className="flex gap-1">
      {wizardColorOptions.map(o => (
        <button
          key={o.key}
          type="button"
          title={o.label}
          onClick={() => onSelect(o.key)}
          className="w-5 h-5 rounded-full transition-all"
          style={{
            background: o.hex,
            outline: selected === o.key ? `2px solid white` : '2px solid transparent',
            outlineOffset: 1,
          }}
        />
      ))}
    </div>
  </div>
);

export default GameLoader;
