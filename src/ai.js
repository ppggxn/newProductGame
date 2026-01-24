// src/ai.js

import { GRID_SIZE, WIN_COUNT, FACTOR_RANGE } from './constants';


/**
 * 获取 AI 的下一步移动
 */
export function getAIMove(board, factors, turnCount) {
  // 1. 尝试贪心策略
  const greedyMove = getGreedyMove(board, factors, turnCount);
  if (greedyMove) return greedyMove;

  // 2. 兜底：随机策略
  return getRandomMove(board, factors, turnCount);
}

/**
 * [重构] 获取当前所有合法的移动组合
 * 供所有算法（随机、贪心、Minimax）共用
 */
function getAllLegalMoves(board, factors) {
  const moves = [];
  const [f1, f2] = factors;

  // 尝试移动滑块 A (index 0)
  FACTOR_RANGE.forEach(num => {
    const product = num * f2;
    if (num !== f1 && !isProductOccupied(board, product)) {
      moves.push({ clipIndex: 0, value: num, product });
    }
  });

  // 尝试移动滑块 B (index 1)
  FACTOR_RANGE.forEach(num => {
    const product = f1 * num;
    if (num !== f2 && !isProductOccupied(board, product)) {
      moves.push({ clipIndex: 1, value: num, product });
    }
  });

  return moves;
}

/**
 * 贪心策略实现
 */
function getGreedyMove(board, factors, turnCount) {
  if (turnCount < 2) return null;

  const possibleMoves = getAllLegalMoves(board, factors);

  // 优先级 1: 寻找能让自己立即获胜的移动 (进攻)
  const winningMove = possibleMoves.find(m => checkSimulatedWin(board, m.product, 'p2'));
  if (winningMove) return winningMove;

  // 优先级 2: 寻找能拦截玩家获胜的移动 (防守)
  // 逻辑：如果某个格子能让玩家赢，而 AI 这一步恰好能占领它
  const blockingMove = possibleMoves.find(m => checkSimulatedWin(board, m.product, 'p1'));
  if (blockingMove) return blockingMove;

  return null;
}

/**
 * 核心：模拟胜负判定
 * 判断如果在 product 位置落子，player 是否会达成连子
 */
function checkSimulatedWin(board, product, player) {
  const index = board.findIndex(c => c.value === product);
  if (index === -1) return false;

  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

  for (let [dx, dy] of directions) {
    let count = 1;

    // 正向搜索：假设当前格子已经被 player 占据
    let r = row + dx, c = col + dy;
    while (isValid(r, c) && getOwnerAt(board, r, c, index, player) === player) {
      count++; r += dx; c += dy;
    }

    // 反向搜索
    r = row - dx; c = col - dy;
    while (isValid(r, c) && getOwnerAt(board, r, c, index, player) === player) {
      count++; r -= dx; c -= dy;
    }

    if (count >= WIN_COUNT) return true;
  }
  return false;
}

/**
 * 辅助：获取模拟状态下的格子主人
 */
function getOwnerAt(board, r, c, simulatedIndex, simulatedPlayer) {
  const currentIndex = r * GRID_SIZE + c;
  if (currentIndex === simulatedIndex) return simulatedPlayer;
  return board[currentIndex]?.owner;
}

function isValid(r, c) {
  return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
}

function isProductOccupied(board, val) {
  const cell = board.find(c => c.value === val);
  return cell && cell.owner !== null;
}

/**
 * 随机策略：已重构为使用 getAllLegalMoves
 */
function getRandomMove(board, factors, turnCount) {
  if (turnCount === 0) {
    return { clipIndex: 0, value: FACTOR_RANGE[Math.floor(Math.random() * FACTOR_RANGE.length)] };
  }
  if (turnCount === 1) {
    const validValues = FACTOR_RANGE.filter(num => !isProductOccupied(board, factors[0] * num));
    return { clipIndex: 1, value: validValues[Math.floor(Math.random() * validValues.length)] || FACTOR_RANGE[0] };
  }

  const possibleMoves = getAllLegalMoves(board, factors);
  if (possibleMoves.length === 0) return null;

  return possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
}