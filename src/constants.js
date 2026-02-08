// src/constants.js

export const GRID_SIZE = 6;
export const WIN_COUNT = 3;
export const FACTOR_RANGE = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const THINKING_TIME = 1000;

export const PLAYER = {
  P1: 'p1',
  P2: 'p2',
  DRAW: 'draw'
};

// parameters for miniMax
export const AI_SEARCH_DEPTH = 4;
export const SCORES = {
  WIN: 100000,
  LOSE: -100000,
  DRAW: 0
};

export const POSITIONAL_WEIGHTS = [
  0,  2,  2,  2,  2,  0,
  2, 10, 20, 20, 10,  2,
  2, 20, 50, 50, 20,  2,
  2, 20, 50, 50, 20,  2,
  2, 10, 20, 20, 10,  2,
  0,  2,  2,  2,  2,  0
];