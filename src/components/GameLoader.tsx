'use client'

import React from 'react';
import { motion } from 'framer-motion';
import PortalPongGame from './PortalPongGame';
import SpyGame from './SpyGame';

interface Game {
  id: 'spygame' | 'portalpong';
  title: string;
  component: React.FC;
  color: string;
}

interface GameCartridgeProps {
  title: string;
  selected: boolean;
  onClick: () => void;
  color: string;
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

const GameCartridge: React.FC<GameCartridgeProps> = ({ title, selected, onClick, color }) => (
  <motion.div
    className={`w-48 h-24 m-2 p-4 border-4 border-gray-700 rounded-lg cursor-pointer 
      ${selected ? `bg-${color}-400` : 'bg-gray-300'} hover:bg-${color}-200`}
    onClick={onClick}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
  >
    <h2 className="text-center text-xl font-bold text-gray-800">{title}</h2>
  </motion.div>
);

const GameLoader: React.FC = () => {
  const [selectedGame, setSelectedGame] = React.useState<Game | null>(null);

  if (selectedGame?.component) {
    const GameComponent = selectedGame.component;
    return (
      <div className="w-full h-screen bg-black">
        <GameComponent />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl md:text-6xl font-bold text-yellow-400 mb-8 text-center">
        Game Loader
      </h1>
      <div className="flex flex-wrap justify-center mb-8">
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
    </div>
  );
};

export default GameLoader;

