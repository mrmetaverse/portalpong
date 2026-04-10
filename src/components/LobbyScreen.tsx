'use client'
import React from 'react';
import { PortalPongConfig, WizardColorKey } from './PortalPongGame';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerProfile {
  id: string;
  username: string;
  color: WizardColorKey;
  wins?: number; losses?: number; ties?: number;
  pvpWins?: number; pvpLosses?: number; pvpTies?: number;
  goalsFor?: number; goalsAgainst?: number;
  pvpGoalsFor?: number; pvpGoalsAgainst?: number;
  gamesAi?: number; gamesPvp?: number;
}

export interface LobbyRoom {
  code: string;
  status: 'waiting' | 'starting' | 'playing' | 'done';
  hostId: string; hostName: string; hostColor: string;
  preset: string; background: string; seed: number;
  isPublic: string;
  player1Id: string; player2Id: string;
  player2Name: string; player2Color: string;
  createdAt: number;
}

interface LeaderboardEntry { id: string; name: string; score: number; rank: number; }
interface Leaderboards {
  winsAll: LeaderboardEntry[];
  goalsAll: LeaderboardEntry[];
  winsPvp: LeaderboardEntry[];
  goalsPvp: LeaderboardEntry[];
}

type LobbyView = 'menu' | 'browse' | 'create' | 'waiting' | 'queue' | 'leaderboard' | 'profile';

type LobbyInitialMode = 'ai' | 'create' | 'join-code' | 'browse' | 'auto-match' | undefined;

interface LobbyScreenProps {
  player: PlayerProfile;
  onPlayerUpdate: (p: PlayerProfile) => void;
  onClose: () => void;
  onLaunch: (config: PortalPongConfig, matchInfo: { roomCode: string; side: 'player1' | 'player2'; player1Id: string; player2Id: string }) => void;
  /** If set, lobby opens directly on this sub-view instead of the menu */
  initialMode?: LobbyInitialMode;
  /** Pre-configured level/game settings from the wizard (used when creating rooms) */
  preConfigured?: Partial<PortalPongConfig>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COLOR_PREVIEWS: Record<string, string> = {
  teal: '#14b8a6', cyan: '#22d3ee', lavender: '#c4b5fd', darkPurple: '#6d28d9',
  red: '#ef4444', blue: '#3b82f6', yellow: '#facc15', orange: '#f97316'
};

const api = async (path: string, opts: RequestInit = {}) => {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return r.json();
};

const Btn: React.FC<{ onClick?: () => void; className?: string; disabled?: boolean; children: React.ReactNode }> =
  ({ onClick, className = '', disabled, children }) => (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`border px-4 py-2 text-xs uppercase tracking-wide font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}>
      {children}
    </button>
  );

const Panel: React.FC<{ title: string; onBack?: () => void; children: React.ReactNode }> =
  ({ title, onBack, children }) => (
    <div className="w-full max-w-3xl border border-cyan-200/30 bg-slate-900/50 backdrop-blur-md shadow-[0_0_32px_rgba(34,211,238,0.12)]">
      <div className="flex items-center justify-between border-b border-cyan-100/15 px-5 py-3">
        {onBack && (
          <button type="button" onClick={onBack} className="text-slate-400 hover:text-white text-xs mr-3">← Back</button>
        )}
        <h2 className="text-sm font-bold uppercase tracking-widest text-cyan-200 flex-1">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );

const statN = (v: unknown) => Number(v) || 0;

// ─── Main Component ───────────────────────────────────────────────────────────

const LobbyScreen: React.FC<LobbyScreenProps> = ({
  player, onPlayerUpdate, onClose, onLaunch, initialMode, preConfigured
}) => {
  const initialView: LobbyView = (() => {
    if (initialMode === 'create') return 'create';
    if (initialMode === 'join-code') return 'menu'; // menu has join-by-code field
    if (initialMode === 'browse') return 'browse';
    if (initialMode === 'auto-match') return 'queue';
    return 'menu';
  })();
  const [view, setView] = React.useState<LobbyView>(initialView);
  const [editName, setEditName] = React.useState(player.username);
  const [editColor, setEditColor] = React.useState<WizardColorKey>(player.color);
  const [savingProfile, setSavingProfile] = React.useState(false);

  // Auto-trigger browse load when opening in browse mode
  React.useEffect(() => {
    if (initialMode === 'browse') loadRooms(); // eslint-disable-line react-hooks/exhaustive-deps
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Browse state
  const [rooms, setRooms] = React.useState<LobbyRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = React.useState(false);

  // Create state
  const [createPreset, setCreatePreset] = React.useState<string>('normal');
  const [createBg, setCreateBg] = React.useState<string>('random');
  const [createPublic, setCreatePublic] = React.useState(true);
  const [creating, setCreating] = React.useState(false);

  // Waiting room state
  const [waitingRoom, setWaitingRoom] = React.useState<LobbyRoom | null>(null);
  const [waitingSide, setWaitingSide] = React.useState<'player1' | 'player2'>('player1');
  const [copied, setCopied] = React.useState(false);

  // Queue state
  const [queuePos, setQueuePos] = React.useState<number | null>(null);
  const [queueSize, setQueueSize] = React.useState(0);

  // Leaderboard state
  const [leaderboards, setLeaderboards] = React.useState<Leaderboards | null>(null);
  const [lbTab, setLbTab] = React.useState<'winsAll' | 'goalsAll' | 'winsPvp' | 'goalsPvp'>('winsAll');
  const [lbLoading, setLbLoading] = React.useState(false);

  const [error, setError] = React.useState('');
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  // ── Save profile ────────────────────────────────────────────────────────────
  const saveProfile = async () => {
    setSavingProfile(true);
    setError('');
    try {
      const res = await api('/api/player', {
        method: 'POST',
        body: JSON.stringify({ id: player.id, username: editName.trim() || 'Player', color: editColor })
      });
      if (res.ok && res.player) onPlayerUpdate({ ...player, ...res.player, color: editColor });
    } catch { setError('Failed to save profile'); }
    setSavingProfile(false);
  };

  // ── Browse rooms ────────────────────────────────────────────────────────────
  const loadRooms = async () => {
    setLoadingRooms(true);
    try {
      const res = await api('/api/rooms');
      if (res.ok) setRooms(res.rooms || []);
    } catch { /* ignore */ }
    setLoadingRooms(false);
  };

  const openBrowse = () => { setView('browse'); loadRooms(); };

  const joinRoom = async (room: LobbyRoom) => {
    setError('');
    try {
      const res = await api(`/api/lobby?code=${room.code}`, {
        method: 'PUT',
        body: JSON.stringify({ player2Id: player.id, player2Name: player.username, player2Color: player.color })
      });
      if (!res.ok) { setError(res.error || 'Could not join room'); return; }
      // Mark as playing immediately so player1's poll sees the match is ready,
      // then launch without waiting — avoids the race where player1 sets 'playing'
      // before player2's first poll fires.
      await api(`/api/lobby?code=${room.code}`, { method: 'POST', body: JSON.stringify({ status: 'playing' }) });
      launchFromRoom(res.room, 'player2');
    } catch { setError('Failed to join room'); }
  };

  // ── Create room ──────────────────────────────────────────────────────────────
  const createRoom = async () => {
    setCreating(true); setError('');
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    // Use pre-configured settings from wizard if available
    const seed = preConfigured?.seed ?? Math.floor(Math.random() * 1e6);
    const preset = preConfigured?.preset ?? createPreset;
    const background = preConfigured?.background ?? createBg;
    try {
      const res = await api('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ code, hostId: player.id, hostName: player.username, hostColor: player.color, preset, background, seed, isPublic: createPublic })
      });
      if (!res.ok) { setError(res.error || 'Could not create room'); setCreating(false); return; }
      setWaitingRoom(res.room);
      setWaitingSide('player1');
      setView('waiting');
      startWaitingPoll(code, 'player1');
    } catch { setError('Failed to create room'); }
    setCreating(false);
  };

  // ── Join by code ─────────────────────────────────────────────────────────────
  const [joinCode, setJoinCode] = React.useState('');
  const joinByCode = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setError('');
    try {
      const res = await api(`/api/lobby?code=${code}`);
      if (!res.ok || !res.room) { setError('Room not found'); return; }
      if (res.room.status !== 'waiting') { setError('Room is no longer available'); return; }
      await joinRoom(res.room as LobbyRoom);
    } catch { setError('Failed to find room'); }
  };

  // ── Waiting room poll ────────────────────────────────────────────────────────
  const startWaitingPoll = (code: string, side: 'player1' | 'player2') => {
    clearPoll();
    pollRef.current = setInterval(async () => {
      try {
        const res = await api(`/api/lobby?code=${code}`);
        if (!res.ok || !res.room) return;
        const room: LobbyRoom = res.room;
        setWaitingRoom(room);
        if (room.status === 'starting' || room.status === 'playing' || (room.player2Id && room.status === 'waiting')) {
          // Mark playing (idempotent if already set by player2)
          await api(`/api/lobby?code=${code}`, { method: 'POST', body: JSON.stringify({ status: 'playing' }) });
          clearPoll();
          launchFromRoom(room, side);
        }
      } catch { /* ignore */ }
    }, 2000);
  };

  const launchFromRoom = (room: LobbyRoom, side: 'player1' | 'player2') => {
    const config: PortalPongConfig = {
      background: room.background as PortalPongConfig['background'],
      preset: room.preset as PortalPongConfig['preset'] ?? 'normal',
      parallax: preConfigured?.parallax ?? true,
      seed: Number(room.seed),
      player1Color: (room.hostColor as WizardColorKey) ?? 'cyan',
      player2Color: (room.player2Color as WizardColorKey) ?? 'lavender',
      aiDifficulty: 3,
      mode: 'matchmaking',
      localPlayer: side,
      matchmakingRoom: room.code,
      // Carry character choices from the wizard
      player1Character: preConfigured?.player1Character,
      player2Character: preConfigured?.player2Character,
    };
    onLaunch(config, {
      roomCode: room.code, side,
      player1Id: room.player1Id, player2Id: room.player2Id
    });
  };

  const playVsAiInstead = () => {
    if (!waitingRoom) return;
    clearPoll();
    const config: PortalPongConfig = {
      background: waitingRoom.background as PortalPongConfig['background'],
      preset: waitingRoom.preset as PortalPongConfig['preset'] ?? 'normal',
      parallax: true, seed: Number(waitingRoom.seed),
      player1Color: (waitingRoom.hostColor as WizardColorKey) ?? 'cyan',
      player2Color: 'lavender', aiDifficulty: 3,
      mode: 'ai', localPlayer: 'player1', matchmakingRoom: ''
    };
    onLaunch(config, { roomCode: '', side: 'player1', player1Id: player.id, player2Id: '' });
  };

  const cancelWaiting = async () => {
    clearPoll();
    if (waitingRoom && waitingSide === 'player1') {
      await api(`/api/lobby?code=${waitingRoom.code}`, { method: 'DELETE' });
    }
    setWaitingRoom(null);
    setView('menu');
  };

  const copyRoomLink = () => {
    if (!waitingRoom) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${waitingRoom.code}&side=player2`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Auto-match queue ─────────────────────────────────────────────────────────
  const joinQueue = async () => {
    setError('');
    try {
      const res = await api('/api/queue', {
        method: 'POST',
        body: JSON.stringify({ playerId: player.id, username: player.username, color: player.color, preset: createPreset })
      });
      if (!res.ok) { setError(res.error || 'Queue error'); return; }
      if (res.matched) {
        const lobbyRes = await api(`/api/lobby?code=${res.roomCode}`);
        if (lobbyRes.room) { setWaitingRoom(lobbyRes.room); setWaitingSide(res.side); setView('waiting'); startWaitingPoll(res.roomCode, res.side); return; }
      }
      setView('queue');
      startQueuePoll();
    } catch { setError('Failed to join queue'); }
  };

  const startQueuePoll = () => {
    clearPoll();
    pollRef.current = setInterval(async () => {
      try {
        const res = await api(`/api/queue?id=${player.id}`);
        if (!res.ok) return;
        if (res.matched) {
          clearPoll();
          const lobbyRes = await api(`/api/lobby?code=${res.roomCode}`);
          if (lobbyRes.room) { setWaitingRoom(lobbyRes.room); setWaitingSide(res.side); setView('waiting'); startWaitingPoll(res.roomCode, res.side); }
        } else {
          setQueuePos(res.position ?? null);
          setQueueSize(res.queueSize ?? 0);
        }
      } catch { /* ignore */ }
    }, 2000);
  };

  const leaveQueue = async () => {
    clearPoll();
    await api(`/api/queue?id=${player.id}`, { method: 'DELETE', body: JSON.stringify({ playerId: player.id }) });
    setView('menu');
  };

  // ── Leaderboard ──────────────────────────────────────────────────────────────
  const loadLeaderboard = async () => {
    setLbLoading(true);
    try {
      const res = await api('/api/leaderboard');
      if (res.ok) setLeaderboards(res.leaderboards);
    } catch { /* ignore */ }
    setLbLoading(false);
  };

  const openLeaderboard = () => { setView('leaderboard'); loadLeaderboard(); };

  // Cleanup on unmount
  React.useEffect(() => () => clearPoll(), []);

  const lbLabels = { winsAll: 'Most Wins (All)', goalsAll: 'Most Goals (All)', winsPvp: 'Wins vs Players', goalsPvp: 'Goals vs Players' };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 font-mono overflow-auto">

      {/* ── Menu ── */}
      {view === 'menu' && (
        <Panel title="Multiplayer Lobby" onBack={onClose}>
          {/* Profile strip */}
          <div className="flex flex-wrap items-end gap-3 mb-5 p-3 border border-white/10 bg-slate-900/40">
            <div className="flex-1 min-w-[160px]">
              <div className="text-[10px] text-slate-400 uppercase mb-1">Your Name</div>
              <input
                className="w-full border border-cyan-300/50 bg-slate-950 px-2 py-1.5 text-sm text-white"
                value={editName}
                maxLength={20}
                onChange={e => setEditName(e.target.value)}
              />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase mb-1">Color</div>
              <select className="border border-cyan-300/50 bg-slate-950 px-2 py-1.5 text-sm text-white"
                value={editColor} onChange={e => setEditColor(e.target.value as WizardColorKey)}>
                {Object.entries(COLOR_PREVIEWS).map(([k]) => (
                  <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>
                ))}
              </select>
            </div>
            <Btn onClick={saveProfile} disabled={savingProfile}
              className="border-cyan-400/60 text-cyan-200 hover:bg-cyan-900/20">
              {savingProfile ? 'Saving…' : 'Save'}
            </Btn>
            {/* Color chip */}
            <div className="w-6 h-6 rounded-full border border-white/20"
              style={{ backgroundColor: COLOR_PREVIEWS[editColor] }} />
          </div>

          {/* Player stats */}
          <div className="grid grid-cols-4 gap-2 mb-5 text-center text-[11px]">
            {[
              ['Wins', statN(player.wins)],
              ['Losses', statN(player.losses)],
              ['Goals', statN(player.goalsFor)],
              ['PvP W', statN(player.pvpWins)]
            ].map(([label, val]) => (
              <div key={String(label)} className="border border-white/10 bg-slate-900/30 py-2">
                <div className="text-slate-400 uppercase text-[9px]">{label}</div>
                <div className="text-white font-bold text-lg">{val}</div>
              </div>
            ))}
          </div>

          {/* Nav buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Btn onClick={openBrowse} className="border-sky-400/60 text-sky-200 hover:bg-sky-900/20 py-4 text-sm">
              Browse Rooms
            </Btn>
            <Btn onClick={() => setView('create')} className="border-emerald-400/60 text-emerald-200 hover:bg-emerald-900/20 py-4 text-sm">
              Create Room
            </Btn>
            <Btn onClick={joinQueue} className="border-violet-400/60 text-violet-200 hover:bg-violet-900/20 py-4 text-sm">
              Auto Match
            </Btn>
            <Btn onClick={openLeaderboard} className="border-yellow-400/60 text-yellow-200 hover:bg-yellow-900/20 py-4 text-sm">
              Leaderboard
            </Btn>
          </div>

          {/* Join by code */}
          <div className="mt-4 flex gap-2">
            <input
              className="flex-1 border border-white/20 bg-slate-950 px-3 py-2 text-xs uppercase text-white placeholder-slate-500"
              placeholder="Room Code"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={8}
            />
            <Btn onClick={joinByCode} className="border-white/30 text-white hover:bg-white/5">
              Join
            </Btn>
          </div>

          {error && <p className="mt-3 text-red-400 text-xs">{error}</p>}
        </Panel>
      )}

      {/* ── Browse Rooms ── */}
      {view === 'browse' && (
        <Panel title="Open Rooms" onBack={() => setView('menu')}>
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-slate-400">{rooms.length} open room{rooms.length !== 1 ? 's' : ''}</span>
            <Btn onClick={loadRooms} disabled={loadingRooms} className="border-white/20 text-slate-300 hover:bg-white/5">
              {loadingRooms ? 'Loading…' : 'Refresh'}
            </Btn>
          </div>
          {rooms.length === 0 && !loadingRooms && (
            <div className="text-center text-slate-400 py-8 text-sm">No open rooms. Create one!</div>
          )}
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
            {rooms.map(room => (
              <div key={room.code} className="flex items-center justify-between border border-white/10 bg-slate-900/30 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full border border-white/20"
                      style={{ backgroundColor: COLOR_PREVIEWS[room.hostColor] || '#888' }} />
                    <span className="text-white text-sm font-bold">{room.hostName}</span>
                    <span className="text-slate-500 text-[10px] uppercase ml-1">{room.code}</span>
                  </div>
                  <div className="text-slate-400 text-[10px] mt-0.5 uppercase">
                    {room.preset} · {room.background}
                  </div>
                </div>
                <Btn onClick={() => joinRoom(room)} className="border-emerald-400/60 text-emerald-200 hover:bg-emerald-900/20">
                  Join
                </Btn>
              </div>
            ))}
          </div>
          {error && <p className="mt-3 text-red-400 text-xs">{error}</p>}
        </Panel>
      )}

      {/* ── Create Room ── */}
      {view === 'create' && (
        <Panel title="Create Room" onBack={() => setView('menu')}>
          <div className="grid gap-4 sm:grid-cols-2 mb-5">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-400 uppercase">Preset</span>
              <select className="border border-cyan-300/50 bg-slate-950 p-2 text-white"
                value={createPreset} onChange={e => setCreatePreset(e.target.value)}>
                <option value="light">Light</option>
                <option value="normal">Normal</option>
                <option value="chaos">Chaos</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-400 uppercase">Background</span>
              <select className="border border-cyan-300/50 bg-slate-950 p-2 text-white"
                value={createBg} onChange={e => setCreateBg(e.target.value)}>
                {['random', 'bg1', 'bg2', 'bg3', 'bg4', 'bg5', 'bg6', 'bg7'].map(b => (
                  <option key={b} value={b}>{b === 'random' ? 'Random' : b.toUpperCase()}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 text-xs col-span-2">
              <input type="checkbox" checked={createPublic} onChange={e => setCreatePublic(e.target.checked)} />
              <span className="text-slate-300 uppercase">Public Room (visible in browser)</span>
            </label>
          </div>
          <Btn onClick={createRoom} disabled={creating}
            className="border-emerald-400/60 text-emerald-200 hover:bg-emerald-900/20 w-full py-3 text-sm">
            {creating ? 'Creating…' : 'Create Room'}
          </Btn>
          {error && <p className="mt-3 text-red-400 text-xs">{error}</p>}
        </Panel>
      )}

      {/* ── Waiting Room ── */}
      {view === 'waiting' && waitingRoom && (
        <Panel title={waitingSide === 'player1' ? 'Waiting for Challenger' : 'Joining Room'}>
          <div className="flex flex-col items-center gap-5 py-2">
            {/* Room code */}
            <div className="text-center">
              <div className="text-[10px] text-slate-400 uppercase mb-2">Room Code</div>
              <button
                type="button"
                onClick={copyRoomLink}
                className="text-4xl font-black tracking-[0.3em] text-cyan-300 drop-shadow-[0_0_16px_rgba(34,211,238,0.6)] hover:text-cyan-100 transition-colors"
              >
                {waitingRoom.code}
              </button>
              <div className="text-[10px] text-slate-400 mt-1">{copied ? '✓ Link copied!' : 'Click to copy invite link'}</div>
            </div>

            {/* Players */}
            <div className="flex gap-6 items-center">
              <div className="flex flex-col items-center gap-1">
                <div className="w-8 h-8 rounded-full border-2 border-cyan-400"
                  style={{ backgroundColor: COLOR_PREVIEWS[waitingRoom.hostColor] || '#22d3ee' }} />
                <span className="text-xs text-white">{waitingRoom.hostName}</span>
                <span className="text-[9px] text-slate-400 uppercase">Host</span>
              </div>
              <div className="text-slate-500 text-xl font-bold">VS</div>
              <div className="flex flex-col items-center gap-1">
                {waitingRoom.player2Id ? (
                  <>
                    <div className="w-8 h-8 rounded-full border-2 border-violet-400"
                      style={{ backgroundColor: COLOR_PREVIEWS[waitingRoom.player2Color] || '#c4b5fd' }} />
                    <span className="text-xs text-white">{waitingRoom.player2Name}</span>
                    <span className="text-[9px] text-emerald-400 uppercase animate-pulse">Joined!</span>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-full border-2 border-dashed border-slate-500 flex items-center justify-center">
                      <span className="text-slate-500 text-sm animate-pulse">?</span>
                    </div>
                    <span className="text-xs text-slate-400">Waiting…</span>
                    <span className="text-[9px] text-slate-500 uppercase">Challenger</span>
                  </>
                )}
              </div>
            </div>

            {/* Match info */}
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">
              {waitingRoom.preset} · {waitingRoom.background}
            </div>

            <div className="flex flex-wrap gap-3 justify-center">
              {waitingSide === 'player1' && !waitingRoom.player2Id && (
                <Btn onClick={playVsAiInstead}
                  className="border-slate-400/60 text-slate-200 hover:bg-slate-800/40">
                  Play vs AI Instead
                </Btn>
              )}
              <Btn onClick={cancelWaiting} className="border-red-400/50 text-red-300 hover:bg-red-900/20">
                Cancel
              </Btn>
            </div>
          </div>
        </Panel>
      )}

      {/* ── Auto-match Queue ── */}
      {view === 'queue' && (
        <Panel title="Finding a Match">
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-violet-400/30" />
              <div className="absolute inset-0 rounded-full border-t-2 border-violet-400 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-violet-300 text-xs font-bold">
                {queuePos ?? '…'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-white text-sm font-bold">Searching for opponent…</div>
              <div className="text-slate-400 text-xs mt-1">
                {queuePos !== null ? `Position ${queuePos} of ${queueSize} in queue` : 'Joining queue…'}
              </div>
            </div>
            <Btn onClick={leaveQueue} className="border-red-400/50 text-red-300 hover:bg-red-900/20">
              Cancel
            </Btn>
          </div>
        </Panel>
      )}

      {/* ── Leaderboard ── */}
      {view === 'leaderboard' && (
        <Panel title="Leaderboard" onBack={() => setView('menu')}>
          {/* Category tabs */}
          <div className="flex flex-wrap gap-1 mb-4">
            {(Object.keys(lbLabels) as Array<keyof typeof lbLabels>).map(k => (
              <button type="button" key={k} onClick={() => setLbTab(k)}
                className={`border px-3 py-1 text-[10px] uppercase transition-colors ${lbTab === k ? 'border-yellow-300/70 bg-yellow-300/10 text-yellow-200' : 'border-white/15 text-slate-400 hover:text-white'}`}>
                {lbLabels[k]}
              </button>
            ))}
            <button type="button" onClick={loadLeaderboard} disabled={lbLoading}
              className="border border-white/15 px-3 py-1 text-[10px] uppercase text-slate-400 hover:text-white ml-auto disabled:opacity-40">
              {lbLoading ? '…' : '↺'}
            </button>
          </div>

          {/* Table */}
          <div className="border border-white/10">
            <div className="grid grid-cols-[2rem_1fr_5rem] border-b border-white/10 px-3 py-1.5 text-[10px] text-slate-400 uppercase">
              <span>#</span><span>Player</span><span className="text-right">{lbTab.includes('goal') ? 'Goals' : 'Wins'}</span>
            </div>
            {lbLoading && (
              <div className="text-center text-slate-400 text-xs py-6">Loading…</div>
            )}
            {!lbLoading && (!leaderboards || (leaderboards[lbTab] || []).length === 0) && (
              <div className="text-center text-slate-400 text-xs py-6">No data yet. Play some matches!</div>
            )}
            {!lbLoading && leaderboards && (leaderboards[lbTab] || []).map((entry, i) => {
              const isMe = entry.id.startsWith(player.id);
              return (
                <div key={entry.id} className={`grid grid-cols-[2rem_1fr_5rem] px-3 py-2.5 border-b border-white/5 text-sm ${isMe ? 'bg-cyan-900/20 text-cyan-200' : 'text-white'}`}>
                  <span className={`text-xs font-bold ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500'}`}>
                    {i + 1}
                  </span>
                  <span className="truncate font-medium">{entry.name}{isMe ? ' (you)' : ''}</span>
                  <span className="text-right font-bold">{entry.score}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
};

export default LobbyScreen;
