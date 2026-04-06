import { Color, Piece, Player, Tile, TileType } from '../types/game';

export const COLORS: Color[] = ['red', 'blue', 'yellow', 'green'];

export const BOARD_SIZE = 52; // Total common tiles

export const START_POSITIONS: Record<Color, number> = {
  red: 0,
  blue: 13,
  yellow: 26,
  green: 39,
};

export const BUFF_LOCATIONS: Record<number, TileType> = {
  3: 'BUFF_HEAL',
  6: 'BUFF_ATTACK',
  10: 'BUFF_RANGE',
  16: 'BUFF_HEAL',
  19: 'BUFF_ATTACK',
  23: 'BUFF_RANGE',
  29: 'BUFF_HEAL',
  32: 'BUFF_ATTACK',
  36: 'BUFF_RANGE',
  42: 'BUFF_HEAL',
  45: 'BUFF_ATTACK',
  49: 'BUFF_RANGE',
};

export const SAFE_ZONES = [0, 8, 13, 21, 26, 34, 39, 47];

export interface PlayerConfig {
  color: Color;
  isBot: boolean;
  isActive: boolean;
}

export const createInitialPlayers = (configs: PlayerConfig[]): Player[] => {
  return configs
    .filter(conf => conf.isActive)
    .map((conf) => ({
      id: `player-${conf.color}`,
      name: `Player ${conf.color.toUpperCase()}${conf.isBot ? ' (BOT)' : ''}`,
      color: conf.color,
      isBot: conf.isBot,
      pieces: Array.from({ length: 4 }, (_, i) => ({
        id: `${conf.color}-${i}`,
        color: conf.color,
        position: -1,
        hp: 1,
        attack: 1,
        range: 0,
        buffs: [],
      })),
    }));
};

export const getTileType = (index: number): TileType => {
  if (BUFF_LOCATIONS[index]) return BUFF_LOCATIONS[index];
  if (SAFE_ZONES.includes(index)) return 'SAFE';
  return 'NORMAL';
};

// Helper to calculate actual board index for rendering
export const getGlobalIndex = (localPos: number, color: Color): number => {
  if (localPos === -1) return -1; // Home
  if (localPos >= 52) return localPos; // Home stretch or finished
  return (localPos + START_POSITIONS[color]) % 52;
};
