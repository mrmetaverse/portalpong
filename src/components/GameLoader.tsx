'use client'

import React from 'react';
import { motion } from 'framer-motion';
import PortalPongGame, { PortalPongConfig, PortalPongConfigPreset } from './PortalPongGame';
import SpyGame from './SpyGame';

interface Game {
  id: 'spygame' | 'portalpong';
  title: string;
  component: React.FC;
  color: 'blue' | 'red';
}

interface GameCartridgeProps {
  title: string;
  selected: boolean;
  onClick: () => void;
  color: 'blue' | 'red';
}

const games: Game[] = [
  { 
    id: 'portalpong', 
    title: 'PortalPong', 
    component: PortalPongGame,
    color: 'blue'
  },
  { 
    id: 'spygame', 
    title: 'SpyGame', 
    component: SpyGame,
    color: 'red'
  }
];

const cartridgeColors: Record<'blue' | 'red', { selected: string; idle: string; hover: string }> = {
  blue: {
    selected: 'bg-blue-500',
    idle: 'bg-slate-800',
    hover: 'hover:bg-blue-400'
  },
  red: {
    selected: 'bg-red-500',
    idle: 'bg-slate-800',
    hover: 'hover:bg-red-400'
  }
};

const GameCartridge: React.FC<GameCartridgeProps> = ({ title, selected, onClick, color }) => (
  <motion.div
    className={`w-56 h-28 m-2 p-4 border-2 border-slate-600 rounded-lg cursor-pointer transition-colors ${
      selected ? cartridgeColors[color].selected : cartridgeColors[color].idle
    } ${cartridgeColors[color].hover}`}
    onClick={onClick}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
  >
    <h2 className="text-center text-xl font-bold text-white">{title}</h2>
  </motion.div>
);

const randomSeed = () => Math.floor(Math.random() * 1_000_000);

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

const GameLoader: React.FC = () => {
  const [selectedGame, setSelectedGame] = React.useState<Game | null>(null);
  const [portalConfig, setPortalConfig] = React.useState<PortalPongConfig>({
    background: 'random',
    preset: 'normal',
    parallax: true,
    seed: randomSeed()
  });

  if (selectedGame?.id === 'portalpong') {
    return (
      <PortalPongGame
        config={portalConfig}
        onExit={() => setSelectedGame(null)}
      />
    );
  }

  if (selectedGame?.id === 'spygame') {
    const GameComponent = selectedGame.component;
    return (
      <div className="w-full h-screen bg-black">
        <button
          type="button"
          className="absolute z-20 left-4 top-4 rounded-md border border-white/40 bg-black/70 px-3 py-2 text-xs text-white"
          onClick={() => setSelectedGame(null)}
        >
          Back To Loader
        </button>
        <GameComponent />
      </div>
    );
  }

  const updateConfig = <K extends keyof PortalPongConfig>(key: K, value: PortalPongConfig[K]) => {
    setPortalConfig((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl md:text-6xl font-bold text-yellow-400 mb-3 text-center">
        PortalPong
      </h1>
      <p className="mb-8 text-sm md:text-base text-slate-300 text-center max-w-2xl">
        Multiplayer platform physics arena with portals, spell blasts, and procedural layouts.
      </p>
      <div className="flex flex-wrap justify-center mb-6">
        {games.map((game) => (
          <GameCartridge
            key={game.id}
            title={game.title}
            selected={selectedGame?.id === game.id}
            onClick={() => setSelectedGame(game)}
            color={game.color}
          />
        ))}
      </div>
      <div className="w-full max-w-4xl rounded-xl border border-slate-700 bg-slate-900/80 p-4 md:p-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4">PortalPong Match Setup</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Background</span>
            <select
              className="rounded-md border border-slate-600 bg-slate-950 p-2"
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
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Arena Generation</span>
            <select
              className="rounded-md border border-slate-600 bg-slate-950 p-2"
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
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Seed</span>
            <div className="flex gap-2">
              <input
                className="w-full rounded-md border border-slate-600 bg-slate-950 p-2"
                inputMode="numeric"
                value={portalConfig.seed}
                onChange={(e) => {
                  const parsed = Number.parseInt(e.target.value, 10);
                  updateConfig('seed', Number.isNaN(parsed) ? 0 : parsed);
                }}
              />
              <button
                type="button"
                className="rounded-md border border-slate-500 px-3 py-2 text-xs hover:bg-slate-800"
                onClick={() => updateConfig('seed', randomSeed())}
              >
                Randomize
              </button>
            </div>
          </label>
          <label className="flex items-center gap-3 mt-6">
            <input
              type="checkbox"
              checked={portalConfig.parallax}
              onChange={(e) => updateConfig('parallax', e.target.checked)}
            />
            <span className="text-sm text-slate-300">Enable Parallax Edge Layers</span>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-md bg-yellow-400 px-4 py-2 font-semibold text-slate-900 hover:bg-yellow-300"
            onClick={() => setSelectedGame(games.find((game) => game.id === 'portalpong') ?? null)}
          >
            Launch PortalPong
          </button>
          <p className="text-xs text-slate-400">
            Controls: Use WASD to move and jump, click to blast wand. Other players are intended for network sync.
          </p>
        </div>
      </div>
    </div>
  );
};

export default GameLoader;

