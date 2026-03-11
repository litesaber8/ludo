export type Color = 'red' | 'blue' | 'yellow' | 'green';

export type BuffType = 'HEAL' | 'ATTACK_RANGE' | 'SHIELD' | 'DOUBLE_DICE';

export interface Buff {
  type: BuffType;
  value: number;
  duration?: number; // turns, if any
}

export interface Piece {
  id: string;
  color: Color;
  position: number; // -1 for home, 0-51 for common path, 52-57 for home stretch, 100 for finished
  hp: number;
  attack: number;
  range: number;
  buffs: Buff[];
}

export interface Player {
  id: string;
  name: string;
  color: Color;
  isBot: boolean;
  pieces: Piece[];
}

export type TileType = 'NORMAL' | 'SAFE' | 'BUFF_HEAL' | 'BUFF_ATTACK' | 'BUFF_RANGE';

export interface Tile {
  index: number;
  type: TileType;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  diceValue: number;
  isGameOver: boolean;
  gameLog: string[];
}
