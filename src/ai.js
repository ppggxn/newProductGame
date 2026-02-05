// src/ai.js
import { GRID_SIZE, FACTOR_RANGE, AI_SEARCH_DEPTH, SCORES, PLAYER } from './constants';

/**
 * 获取 AI 的下一步移动
 */
export function getAIMove(board, factors, turnCount, valueToIndexMap, currentWinCount, difficulty = 'smartGreedy') {
  // --- 自动识别角色逻辑 ---
  // 根据回合数推断：0, 2, 4... 是 P1；1, 3, 5... 是 P2
  const aiPlayer = (turnCount % 2 === 0) ? PLAYER.P1 : PLAYER.P2;
  const opponent = (aiPlayer === PLAYER.P1) ? PLAYER.P2 : PLAYER.P1;

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
      return getMinimaxMove(board, factors, turnCount, valueToIndexMap, currentWinCount, aiPlayer, opponent);
    default:
      return getRandomMove(board, factors, turnCount, valueToIndexMap);
  }
}

/**
 * 高级贪心策略
 * 给每一个合法的移动打分，选分最高的。
 */
function getSmartGreedyMove(board, factors, turnCount, valueToIndexMap, targetCount, aiPlayer, opponent) {
  if (turnCount < 2) return null;

  const possibleMoves = getAllLegalMoves(board, factors, valueToIndexMap);
  if (possibleMoves.length === 0) return null;

  const SCORES = {
    WIN: 100000,
    BLOCK: 20000,
    GIVE_WIN: -50000,
    CREATE_THREAT: 500,
    EXTEND_CHAIN: 100,
    CENTER_BONUS: 20,
  };

  possibleMoves.forEach(move => {
    move.score = 0;

    // 1. 进攻：这步能赢吗？(使用传入的 aiPlayer)
    if (checkSimulatedWin(board, move.product, aiPlayer, valueToIndexMap, targetCount)) {
      move.score += SCORES.WIN;
    }

    // 2. 防守：堵路 (使用传入的 opponent)
    if (checkSimulatedWin(board, move.product, opponent, valueToIndexMap, targetCount)) {
      move.score += SCORES.BLOCK;
    }

    // --- [核心修复开始] ---

    // 3. 风险检查：
    // 我们必须模拟“我下在这之后”的世界，而不是检查“当前”的世界。
    const nextFactors = [...factors];
    nextFactors[move.clipIndex] = move.value;

    // 创建一个模拟棋盘 (Shallow copy 数组，并在特定索引处更新对象)
    const nextBoard = [...board];
    const idx = valueToIndexMap[move.product];
    if (idx !== undefined) {
        // 在模拟棋盘上，这个位置已经被 AI 占据了！
        // 这样 canOpponentWinNextTurn 就不会认为对手还能下在这里
        nextBoard[idx] = { ...nextBoard[idx], owner: aiPlayer };
    }

    // 将 nextBoard 传入检查函数
    if (canOpponentWinNextTurn(nextBoard, nextFactors, valueToIndexMap, targetCount, opponent)) {
      move.score += SCORES.GIVE_WIN;
    }

    // 4. 连珠潜力
    const chainLength = getLongestChainAfterMove(board, move.product, aiPlayer, valueToIndexMap);
    if (chainLength === targetCount - 1) {
      move.score += SCORES.CREATE_THREAT;
    } else {
      move.score += chainLength * SCORES.EXTEND_CHAIN;
    }

    // 5. 中心控制
    const r = Math.floor(idx / GRID_SIZE);
    const c = idx % GRID_SIZE;
    if (r >= 2 && r <= 3 && c >= 2 && c <= 3) {
      move.score += SCORES.CENTER_BONUS;
    }
  });

  possibleMoves.sort((a, b) => b.score - a.score);
  const bestScore = possibleMoves[0].score;
  const bestMoves = possibleMoves.filter(m => m.score === bestScore);

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

/**
 * 预测对手下一回合是否能赢
 * @param currentFactors AI 移动后的滑块位置 [f1, f2]
 */
function canOpponentWinNextTurn(board, currentFactors, valueToIndexMap, targetCount, opponentPlayer) {
  const opponentMoves = getAllLegalMoves(board, currentFactors, valueToIndexMap);

  return opponentMoves.some(move =>
    // 这里 board 已经是 nextBoard (模拟过的)，所以如果 AI 占了关键位，
    // getAllLegalMoves 会认为那个位置不合法(已占用)，或者 checkSimulatedWin 会失败。
    checkSimulatedWin(board, move.product, opponentPlayer, valueToIndexMap, targetCount)
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


// Minimax 入口函数
function getMinimaxMove(board, factors, turnCount, valueToIndexMap, targetCount, me, opponent) {
  // 开局前两步分支极多，且策略相对固定，用贪心加速
  if (turnCount < 2) {
    return getSmartGreedyMove(board, factors, turnCount, valueToIndexMap, targetCount)
           || getRandomMove(board, factors, turnCount, valueToIndexMap);
  }

  // 执行搜索
  const result = minimax(
    board,
    factors,
    AI_SEARCH_DEPTH,
    true,        // isMaximizing: 第一层永远是 AI 自己想最大化得分
    -Infinity,   // Alpha
    Infinity,    // Beta
    valueToIndexMap,
    targetCount,
    me,
    opponent
  );

  return result.move || getRandomMove(board, factors, turnCount, valueToIndexMap);
}

/**
 * 核心递归函数
 */
function minimax(board, factors, depth, isMaximizing, alpha, beta, valueToIndexMap, targetCount, me, opponent) {
  const possibleMoves = getAllLegalMoves(board, factors, valueToIndexMap);

  // 1. 基础情况：无路可走
  if (possibleMoves.length === 0) {
    // 如果是我的回合没路走，我输了；如果是对手没路走，我赢了
    return { score: isMaximizing ? SCORES.LOSE : SCORES.WIN };
  }

  // 2. 基础情况：达到搜索深度，进行静态评估
  if (depth === 0) {
    return { score: evaluateBoard(board, targetCount, me, opponent) };
  }

  const currentPlayer = isMaximizing ? me : opponent;
  let bestMove = null;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of possibleMoves) {
      // 模拟落子
      const idx = valueToIndexMap[move.product];
      const newBoard = [...board];
      newBoard[idx] = { ...newBoard[idx], owner: me };

      const newFactors = [...factors];
      newFactors[move.clipIndex] = move.value;

      // 快速胜利检查
      if (checkSimulatedWin(board, move.product, me, valueToIndexMap, targetCount)) {
        return { score: SCORES.WIN - depth, move: move }; // 减去 depth 是为了让 AI 倾向于更早获胜
      }

      const evalRes = minimax(newBoard, newFactors, depth - 1, false, alpha, beta, valueToIndexMap, targetCount, me, opponent);

      if (evalRes.score > maxEval) {
        maxEval = evalRes.score;
        bestMove = move;
      }
      alpha = Math.max(alpha, evalRes.score);
      if (beta <= alpha) break; // Beta 剪枝
    }
    return { score: maxEval, move: bestMove };

  } else {
    let minEval = Infinity;
    for (const move of possibleMoves) {
      const idx = valueToIndexMap[move.product];
      const newBoard = [...board];
      newBoard[idx] = { ...newBoard[idx], owner: opponent };

      const newFactors = [...factors];
      newFactors[move.clipIndex] = move.value;

      // 快速失败检查（对手赢了）
      if (checkSimulatedWin(board, move.product, opponent, valueToIndexMap, targetCount)) {
        return { score: SCORES.LOSE + depth, move: move };
      }

      const evalRes = minimax(newBoard, newFactors, depth - 1, true, alpha, beta, valueToIndexMap, targetCount, me, opponent);

      if (evalRes.score < minEval) {
        minEval = evalRes.score;
        bestMove = move;
      }
      beta = Math.min(beta, evalRes.score);
      if (beta <= alpha) break; // Alpha 剪枝
    }
    return { score: minEval, move: bestMove };
  }
}

/**
 * 静态评估函数：给当前局面打分
 */
function evaluateBoard(board, targetCount, me, opponent) {
  let totalScore = 0;

  // 简单的启发式评分：
  // 遍历棋盘上每个格子，如果是自己的，看它周围连成线的潜力
  for (let i = 0; i < board.length; i++) {
    if (board[i].owner === me) {
      totalScore += getCellScore(board, i, me, targetCount);
    } else if (board[i].owner === opponent) {
      totalScore -= getCellScore(board, i, opponent, targetCount) * 1.2; // 稍微多给对手一点权重，倾向于防守
    }
  }
  return totalScore;
}

// 辅助：评估单个格子的潜力
function getCellScore(board, index, player, targetCount) {
  let score = 0;
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

  for (let [dx, dy] of directions) {
    let count = 1;
    // 这里简单计算连子长度，实际可增加对“两端是否被堵死”的判断
    let r = row + dx, c = col + dy;
    while (isValid(r, c) && board[r * GRID_SIZE + c].owner === player) { count++; r += dx; c += dy; }
    r = row - dx; c = col - dy;
    while (isValid(r, c) && board[r * GRID_SIZE + c].owner === player) { count++; r -= dx; c -= dy; }

    // 权重：2连子=10分，3连子=100分，以此类推
    score += Math.pow(10, count);
  }
  return score;
}