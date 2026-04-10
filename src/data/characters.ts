// PortalPong – Character definitions, stats, and rock-paper-scissors advantages

export type CharacterType = 'wizard' | 'knight' | 'rogue' | 'witch' | 'berserker' | 'sage' | 'archer';

export interface CharacterStats {
  /** Base movement speed multiplier */
  speed: number;
  /** Jump velocity multiplier */
  jump: number;
  /** Explosion radius / knockback multiplier */
  power: number;
  /** Visual scale of the character */
  size: number;
  /** Knockback-received multiplier (higher = more resistant) */
  defense: number;
  /** Spell cooldown frames multiplier (lower = faster recharge) */
  cooldown: number;
}

export interface CharacterDef {
  id: CharacterType;
  name: string;
  tagline: string;
  description: string;
  stats: CharacterStats;
  /** Characters this one has advantage over */
  strongAgainst: CharacterType[];
  /** Characters that have advantage over this one */
  weakAgainst: CharacterType[];
  /** Primary theme color (hex) */
  themeColor: string;
  /** Secondary accent color (hex) */
  accentColor: string;
  /** Model file path relative to /public */
  modelPath: string;
}

// ---------------------------------------------------------------------------
// Character roster — balanced around Wizard being the "normal" benchmark
// ---------------------------------------------------------------------------

export const CHARACTERS: Record<CharacterType, CharacterDef> = {
  wizard: {
    id: 'wizard',
    name: 'Wizard',
    tagline: 'Master of balanced arcane arts',
    description:
      'Well-rounded and versatile. The Wizard excels at nothing in particular but is weak at nothing either. Perfect for learning the game.',
    stats: { speed: 1.0, jump: 1.0, power: 1.0, size: 1.0, defense: 1.0, cooldown: 1.0 },
    strongAgainst: ['knight', 'berserker'],
    weakAgainst: ['rogue', 'archer'],
    themeColor: '#5b8ff9',
    accentColor: '#c084fc',
    modelPath: '/models/wizard.glb',
  },

  knight: {
    id: 'knight',
    name: 'Knight',
    tagline: 'Immovable iron fortress',
    description:
      'Slow but virtually unstoppable. The Knight resists knockback like a wall and hits with crushing force. Watch your footing though — that armor is heavy.',
    stats: { speed: 0.65, jump: 0.7, power: 1.5, size: 1.2, defense: 2.0, cooldown: 1.5 },
    strongAgainst: ['rogue', 'archer'],
    weakAgainst: ['wizard', 'sage'],
    themeColor: '#94a3b8',
    accentColor: '#38bdf8',
    modelPath: '/models/knight.glb',
  },

  rogue: {
    id: 'rogue',
    name: 'Rogue',
    tagline: 'Strike from the shadows',
    description:
      'The fastest character in the game. The Rogue zips around the arena, attacks rapidly, but shatters under pressure. Hit and run is the only way.',
    stats: { speed: 1.85, jump: 1.5, power: 0.55, size: 0.85, defense: 0.6, cooldown: 0.6 },
    strongAgainst: ['wizard', 'witch'],
    weakAgainst: ['knight', 'berserker'],
    themeColor: '#a855f7',
    accentColor: '#2dd4bf',
    modelPath: '/models/rogue.glb',
  },

  witch: {
    id: 'witch',
    name: 'Witch',
    tagline: 'Hexes and chaos incarnate',
    description:
      'Wields explosive spells with high power and a fast cooldown, but is fragile. The Witch turns the arena into a minefield for those who chase her.',
    stats: { speed: 1.15, jump: 1.05, power: 1.6, size: 0.9, defense: 0.75, cooldown: 0.7 },
    strongAgainst: ['sage', 'archer'],
    weakAgainst: ['rogue', 'berserker'],
    themeColor: '#22c55e',
    accentColor: '#fbbf24',
    modelPath: '/models/witch.glb',
  },

  berserker: {
    id: 'berserker',
    name: 'Berserker',
    tagline: 'Rage without limits',
    description:
      'Raw destructive power. The Berserker\'s explosions are enormous and movement is aggressive, but they\'re reckless — high risk, enormous reward.',
    stats: { speed: 1.45, jump: 1.1, power: 2.0, size: 1.1, defense: 0.5, cooldown: 1.8 },
    strongAgainst: ['rogue', 'witch'],
    weakAgainst: ['wizard', 'sage'],
    themeColor: '#ef4444',
    accentColor: '#f97316',
    modelPath: '/models/berserker.glb',
  },

  sage: {
    id: 'sage',
    name: 'Sage',
    tagline: 'Gravity is merely a suggestion',
    description:
      'The Sage floats and leaps to incredible heights, making them nearly untouchable in the air. Their spells are measured but precise. Masters require patience.',
    stats: { speed: 0.8, jump: 2.0, power: 0.85, size: 1.0, defense: 1.3, cooldown: 0.9 },
    strongAgainst: ['berserker', 'knight'],
    weakAgainst: ['witch', 'archer'],
    themeColor: '#f0abfc',
    accentColor: '#fde68a',
    modelPath: '/models/sage.glb',
  },

  archer: {
    id: 'archer',
    name: 'Archer',
    tagline: 'Death from a distance',
    description:
      'A medieval longbow specialist who fires fast, piercing arrows across the arena. The Archer controls space with rapid volleys but crumbles in close combat.',
    stats: { speed: 1.1, jump: 1.15, power: 0.75, size: 0.95, defense: 0.65, cooldown: 0.55 },
    strongAgainst: ['wizard', 'sage'],
    weakAgainst: ['knight', 'witch'],
    themeColor: '#84cc16',
    accentColor: '#a3e635',
    modelPath: '/models/archer.glb',
  },
};

export const CHARACTER_LIST = Object.values(CHARACTERS) as CharacterDef[];

/** Returns the advantage multiplier for attacker vs defender (1.0 = neutral, 1.35 = advantage, 0.75 = disadvantage) */
export function getRpsMultiplier(attacker: CharacterType, defender: CharacterType): number {
  if (CHARACTERS[attacker].strongAgainst.includes(defender)) return 1.35;
  if (CHARACTERS[attacker].weakAgainst.includes(defender)) return 0.75;
  return 1.0;
}
