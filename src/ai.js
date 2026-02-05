// src/ai.js
import { GRID_SIZE, FACTOR_RANGE } from './constants';

/**
 * 获取 AI 的下一步移动
 */
export function getAIMove(board, factors, turnCount, valueToIndexMap, currentWinCount, difficulty = 'smartGreedy') {

  // 根据难度路由到不同的算法函数
  switch (difficulty) {
    case 'random':
      return getRandomMove(board, factors, turnCount, valueToIndexMap);

    case 'greedy':
      // 使用文件底部已有的 getGreedyMove
      return getGreedyMove(board, factors, turnCount, valueToIndexMap, currentWinCount)
             || getRandomMove(board, factors, turnCount, valueToIndexMap); // 兜底

    case 'smartGreedy':
      return getSmartGreedyMove(board, factors, turnCount, valueToIndexMap, currentWinCount)
             || getRandomMove(board, factors, turnCount, valueToIndexMap);

    case 'minMax':
      // TODO: 这里目前先用 smartGreedy 顶替，等后续开发了 Minimax 算法后再替换
      console.warn("Minimax not implemented yet, using SmartGreedy");
      return getSmartGreedyMove(board, factors, turnCount, valueToIndexMap, currentWinCount)
             || getRandomMove(board, factors, turnCount, valueToIndexMap);

    default:
      return getRandomMove(board, factors, turnCount, valueToIndexMap);
  }
}

/**
 * 高级贪心策略
 * 给每一个合法的移动打分，选分最高的。
 */
function getSmartGreedyMove(board, factors, turnCount, valueToIndexMap, targetCount) {
  if (turnCount < 2) return null;

  const possibleMoves = getAllLegalMoves(board, factors, valueToIndexMap);

  // 如果无路可走
  if (possibleMoves.length === 0) return null;

  // 评分权重配置
  const SCORES = {
    WIN: 100000,         // 能赢，绝对优先
    BLOCK: 20000,        // 能堵住对手赢，次优先
    GIVE_WIN: -50000,    // 下完这步对手能赢，绝对禁止（自杀）
    CREATE_THREAT: 500,  // 能形成 N-1 连珠（听牌）
    EXTEND_CHAIN: 100,   // 能延长连珠
    CENTER_BONUS: 20,    // 占据中心
  };

  // 对每个移动进行评分
  possibleMoves.forEach(move => {
    move.score = 0;

    // 1. 进攻：这步能赢吗？
    if (checkSimulatedWin(board, move.product, 'p2', valueToIndexMap, targetCount)) {
      move.score += SCORES.WIN;
    }

    // 2. 防守：这步是对手的必胜点吗？（堵路）
    // 逻辑：如果我不占这个格子，对手下回合能占这个格子赢吗？
    // 注意：这里只是简单的位置判断，更复杂的防守是看滑块。
    // 简单的理解：如果这个位置是空位，且对手占了能赢，那我占了它就有防守价值。
    if (checkSimulatedWin(board, move.product, 'p1', valueToIndexMap, targetCount)) {
      move.score += SCORES.BLOCK;
    }

    // 3. 风险检查 (关键优化)：
    // 我走完这步后，滑块变成了 [move.value, existing_other_factor]。
    // 对手下回合能动其中一个滑块，制造出任何能赢的乘积吗？
    const nextFactors = [factors[0], factors[1]];
    nextFactors[move.clipIndex] = move.value; // 模拟移动后的滑块状态

    // 检查对手是否能利用新的滑块组合获胜
    if (canOpponentWinNextTurn(board, nextFactors, valueToIndexMap, targetCount)) {
      move.score += SCORES.GIVE_WIN;
    }

    // 4. 连珠潜力 (启发式)
    // 计算如果不赢，这一步能带来多长的连线
    const chainLength = getLongestChainAfterMove(board, move.product, 'p2', valueToIndexMap);
    if (chainLength === targetCount - 1) {
      move.score += SCORES.CREATE_THREAT; // 听牌
    } else {
      move.score += chainLength * SCORES.EXTEND_CHAIN;
    }

    // 5. 中心控制
    // 6x6 棋盘，中间的格子 (row 2-3, col 2-3) 价值更高
    const idx = valueToIndexMap[move.product];
    const r = Math.floor(idx / GRID_SIZE);
    const c = idx % GRID_SIZE;
    if (r >= 2 && r <= 3 && c >= 2 && c <= 3) {
      move.score += SCORES.CENTER_BONUS;
    }
  });

  // 根据分数降序排列，取最高分
  // 加入一点随机性：如果有多个分数相同的最高分，随机选一个，避免走法僵化
  possibleMoves.sort((a, b) => b.score - a.score);

  const bestScore = possibleMoves[0].score;
  const bestMoves = possibleMoves.filter(m => m.score === bestScore);

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

/**
 * 预测对手下一回合是否能赢
 * @param currentFactors AI 移动后的滑块位置 [f1, f2]
 */
function canOpponentWinNextTurn(board, currentFactors, valueToIndexMap, targetCount) {
  // 模拟对手的回合：对手是 P1 (Human)
  // 对手可以移动 A 或 B
  const opponentMoves = getAllLegalMoves(board, currentFactors, valueToIndexMap);

  // 如果对手有任何一步能赢，返回 true
  return opponentMoves.some(move =>
    checkSimulatedWin(board, move.product, 'p1', valueToIndexMap, targetCount)
  );
}

/**
 * 计算落子后最大的连线长度（用于评分）
 */
function getLongestChainAfterMove(board, product, player, valueToIndexMap) {
  const index = valueToIndexMap[product];
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  let maxLen = 0;

  for (let [dx, dy] of directions) {
    let count = 1;
    let r = row + dx, c = col + dy;
    while (isValid(r, c) && getOwnerAt(board, r, c, index, player) === player) { count++; r += dx; c += dy; }
    r = row - dx; c = col - dy;
    while (isValid(r, c) && getOwnerAt(board, r, c, index, player) === player) { count++; r -= dx; c -= dy; }
    maxLen = Math.max(maxLen, count);
  }
  return maxLen;
}

/**
 * 获取当前所有合法的移动组合
 * 工具函数，供所有算法（随机、贪心、Minimax）共用
 */
function getAllLegalMoves(board, factors, valueToIndexMap) {
  const moves = [];
  const [f1, f2] = factors;
  // 尝试移动滑块 A (index 0)
  FACTOR_RANGE.forEach(num => {
    const product = num * f2;
    if (num !== f1 && !isProductOccupied(board, product, valueToIndexMap)) {
      moves.push({ clipIndex: 0, value: num, product });
    }
  });
  // 尝试移动滑块 B (index 1)
  FACTOR_RANGE.forEach(num => {
    const product = num * f1;
    if (num !== f2 && !isProductOccupied(board, product, valueToIndexMap)) {
      moves.push({ clipIndex: 1, value: num, product });
    }
  });
  return moves;
}

/**
 * 核心：模拟胜负判定
 * 判断如果在 product 位置落子，player 是否会达成连子
 */
function checkSimulatedWin(board, product, player, valueToIndexMap, targetCount) {
  const index = valueToIndexMap[product]; // O(1) 获取索引
  if (index === undefined) return false;

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

    if (count >= targetCount) return true;
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

/**
 * 使用映射表重写合法性检查
 */
function isProductOccupied(board, val, valueToIndexMap) {
  const idx = valueToIndexMap[val];
  if (idx === undefined) return true; // 不在棋盘上的数字视为不可占领
  return board[idx].owner !== null;
}

/**
 * 随机策略
 */
function getRandomMove(board, factors, turnCount, valueToIndexMap) {
  if (turnCount === 0) {
    return { clipIndex: 0, value: FACTOR_RANGE[Math.floor(Math.random() * FACTOR_RANGE.length)] };
  }
  if (turnCount === 1) {
    const validValues = FACTOR_RANGE.filter(num => !isProductOccupied(board, factors[0] * num, valueToIndexMap));
    return { clipIndex: 1, value: validValues[Math.floor(Math.random() * validValues.length)] || FACTOR_RANGE[0] };
  }

  const possibleMoves = getAllLegalMoves(board, factors, valueToIndexMap);
  if (possibleMoves.length === 0) return null;

  return possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
}

/**
 * 初级贪心策略
 */
function getGreedyMove(board, factors, turnCount, valueToIndexMap, currentWinCount) {
  if (turnCount < 2) return null;

  const possibleMoves = getAllLegalMoves(board, factors, valueToIndexMap);

  // 优先级 1: 寻找能让自己立即获胜的移动 (进攻)
  const winningMove = possibleMoves.find(m => checkSimulatedWin(board, m.product, 'p2', valueToIndexMap, currentWinCount));
  if (winningMove) return winningMove;

  // 优先级 2: 寻找能拦截玩家获胜的移动 (防守)
  // 逻辑：如果某个格子能让玩家赢，而 AI 这一步恰好能占领它
  const blockingMove = possibleMoves.find(m => checkSimulatedWin(board, m.product, 'p1', valueToIndexMap, currentWinCount));
  if (blockingMove) return blockingMove;

  return null;
}