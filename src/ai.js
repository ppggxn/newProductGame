// src/ai.js
import { GRID_SIZE, FACTOR_RANGE, AI_SEARCH_DEPTH, SCORES, PLAYER, POSITIONAL_WEIGHTS } from './constants.js';
import { evaluateBoardNN } from './neural_net.js';

/**
 * 获取 AI 的下一步移动
 */
export function getAIMove(board, factors, turnCount, valueToIndexMap, currentWinCount, difficulty) {
  // --- 自动识别角色逻辑 ---
  // 根据回合数推断：0, 2, 4... 是 P1；1, 3, 5... 是 P2
  const aiPlayer = (turnCount % 2 === 0) ? PLAYER.P1 : PLAYER.P2;
  const opponent = (aiPlayer === PLAYER.P1) ? PLAYER.P2 : PLAYER.P1;
  // 根据难度路由到不同的算法函数
  switch (difficulty) {
    case 1:
      return getRandomMove(board, factors, turnCount, valueToIndexMap);
    case 2:
      return getGreedyMove(board, factors, turnCount, valueToIndexMap, currentWinCount, aiPlayer, opponent) || getRandomMove(board, factors, turnCount, valueToIndexMap);
    case 3:
      return getSmartGreedyMove(board, factors, turnCount, valueToIndexMap, currentWinCount, aiPlayer, opponent) || getRandomMove(board, factors, turnCount, valueToIndexMap);
    case 4:
      return getMinmaxMove(board, factors, turnCount, valueToIndexMap, currentWinCount, aiPlayer, opponent, false);
    case 5:
      return getMinmaxMove(board, factors, turnCount, valueToIndexMap, currentWinCount, aiPlayer, opponent, true);
  }
}

/**
 * 高级贪心策略
 */
function getSmartGreedyMove(board, factors, turnCount, valueToIndexMap, targetCount, aiPlayer, opponent) {
  if (turnCount < 2) return null;

  const possibleMoves = getAllLegalMoves(board, factors, valueToIndexMap);
  if (possibleMoves.length === 0) return null;

  // 评分权重配置
  const SCORES_WEIGHT = {
    WIN: 100000,
    BLOCK: 20000,
    GIVE_WIN: -50000,
    CREATE_THREAT: 500,
    EXTEND_CHAIN: 100,
    CENTER_BONUS: 20,
  };

  possibleMoves.forEach(move => {
    move.score = 0;

    // 1. 进攻：这步能赢吗？(使用 aiPlayer)
    if (checkSimulatedWin(board, move.product, aiPlayer, valueToIndexMap, targetCount)) {
      move.score += SCORES_WEIGHT.WIN;
    }

    // 2. 防守：这步是对手的必胜点吗？(使用 opponent)
    if (checkSimulatedWin(board, move.product, opponent, valueToIndexMap, targetCount)) {
      move.score += SCORES_WEIGHT.BLOCK;
    }

    // --- [核心修复] 风险检查 ---
    // 必须在“模拟棋盘”上检查对手能否赢，因为当前格子已经被 AI 占了！

    // 3.1 创建模拟滑块
    const nextFactors = [...factors];
    nextFactors[move.clipIndex] = move.value;

    // 3.2 创建模拟棋盘 (标记当前位置已被 AI 占据)
    const idx = valueToIndexMap[move.product];
    // 只有当格子在棋盘上时才模拟(防止undefined报错)
    let nextBoard = board;
    if (idx !== undefined) {
        nextBoard = [...board]; // 浅拷贝数组
        nextBoard[idx] = { ...nextBoard[idx], owner: aiPlayer }; // 更新该格子的主人
    }

    // 3.3 检查对手在“新棋盘”和“新滑块”下能否获胜
    if (canOpponentWinNextTurn(nextBoard, nextFactors, valueToIndexMap, targetCount, opponent)) {
      move.score += SCORES_WEIGHT.GIVE_WIN;
    }

    // 4. 连珠潜力
    const chainLength = getLongestChainAfterMove(board, move.product, aiPlayer, valueToIndexMap);
    if (chainLength === targetCount - 1) {
      move.score += SCORES_WEIGHT.CREATE_THREAT;
    } else {
      move.score += chainLength * SCORES_WEIGHT.EXTEND_CHAIN;
    }

    // 5. 中心控制
    const r = Math.floor(idx / GRID_SIZE);
    const c = idx % GRID_SIZE;
    if (r >= 2 && r <= 3 && c >= 2 && c <= 3) {
      move.score += SCORES_WEIGHT.CENTER_BONUS;
    }
  });

  possibleMoves.sort((a, b) => b.score - a.score);
  const bestScore = possibleMoves[0].score;
  const bestMoves = possibleMoves.filter(m => m.score === bestScore);

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

/**
 * 预测对手下一回合是否能赢
 * 增加了 opponentPlayer 参数，且接收的是 nextBoard
 */
function canOpponentWinNextTurn(board, currentFactors, valueToIndexMap, targetCount, opponentPlayer) {
  // 基于 nextBoard 获取合法移动。
  // 因为 nextBoard 中 AI 刚才下的位置已经被占用了，
  // 所以 getAllLegalMoves 不会把那个位置算作对手的可选移动。
  const opponentMoves = getAllLegalMoves(board, currentFactors, valueToIndexMap);

  return opponentMoves.some(move =>
    checkSimulatedWin(board, move.product, opponentPlayer, valueToIndexMap, targetCount)
  );
}

/**
 * 计算落子后最大的连线长度
 */
function getLongestChainAfterMove(board, product, player, valueToIndexMap) {
  const index = valueToIndexMap[product];
  if (index === undefined) return 0;

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
 */
function getAllLegalMoves(board, factors, valueToIndexMap) {
  const moves = [];
  const [f1, f2] = factors;

  FACTOR_RANGE.forEach(num => {
    const product = num * f2;
    // 这里传入 board 检查，如果 board 是 nextBoard，已占用的格子会被过滤
    if (num !== f1 && !isProductOccupied(board, product, valueToIndexMap)) {
      moves.push({ clipIndex: 0, value: num, product });
    }
  });

  FACTOR_RANGE.forEach(num => {
    const product = num * f1;
    if (num !== f2 && !isProductOccupied(board, product, valueToIndexMap)) {
      moves.push({ clipIndex: 1, value: num, product });
    }
  });
  return moves;
}

/**
 * 核心：模拟落子并判定是否胜利（内部会把落子写入一个复制的棋盘）
 * 好处：调用方无需负责提前创建 nextBoard，直接调用即可得到“落子后”的结果
 */
function checkSimulatedWin(board, product, player, valueToIndexMap, targetCount) {
  const index = valueToIndexMap[product];
  if (index === undefined) return false; // 非棋盘格子，不能胜利

  // 复制棋盘并模拟落子（浅拷贝足够：cell用对象包裹）
  const nextBoard = [...board];
  const existing = nextBoard[index];
  if (existing) {
    // 保留其他属性，仅替换 owner
    nextBoard[index] = { ...existing, owner: player };
  } else {
    // 万一没有 cell（不太可能），也创建一个占位
    nextBoard[index] = { value: product, owner: player };
  }

  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

  for (let [dx, dy] of directions) {
    let count = 1;

    // 正方向
    let r = row + dx, c = col + dy;
    while (isValid(r, c)) {
      const owner = nextBoard[r * GRID_SIZE + c]?.owner;
      if (owner === player) {
        count++; r += dx; c += dy;
      } else break;
    }

    // 反方向
    r = row - dx; c = col - dy;
    while (isValid(r, c)) {
      const owner = nextBoard[r * GRID_SIZE + c]?.owner;
      if (owner === player) {
        count++; r -= dx; c -= dy;
      } else break;
    }

    if (count >= targetCount) return true;
  }
  return false;
}

function getOwnerAt(board, r, c, simulatedIndex, simulatedPlayer) {
  const currentIndex = r * GRID_SIZE + c;
  if (currentIndex === simulatedIndex) return simulatedPlayer;
  return board[currentIndex]?.owner;
}

function isValid(r, c) {
  return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
}

function isProductOccupied(board, val, valueToIndexMap) {
  const idx = valueToIndexMap[val];
  if (idx === undefined) return true;
  return board[idx].owner !== null;
}

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

function getGreedyMove(board, factors, turnCount, valueToIndexMap, currentWinCount, aiPlayer, opponent) {
  if (turnCount < 2) return null;
  const possibleMoves = getAllLegalMoves(board, factors, valueToIndexMap);
  const winningMove = possibleMoves.find(m => checkSimulatedWin(board, m.product, aiPlayer, valueToIndexMap, currentWinCount));
  if (winningMove) return winningMove;
  const blockingMove = possibleMoves.find(m => checkSimulatedWin(board, m.product, opponent, valueToIndexMap, currentWinCount));
  if (blockingMove) return blockingMove;
  return null;
}

// --- Minmax入口函数 ---
// nn = true表示使用神经网络
function getMinmaxMove(board, factors, turnCount, valueToIndexMap, targetCount, me, opponent, nn) {
  // 开局前两步分支极多，使用 random 加速
  // if (turnCount < 2) {
  //   return getRandomMove(board, factors, turnCount, valueToIndexMap);
  // }

  const result = minmax(
    board,
    factors,
    turnCount,
    AI_SEARCH_DEPTH,
    true,        // isMaximizing
    -Infinity,   // Alpha
    Infinity,    // Beta
    valueToIndexMap,
    targetCount,
    me,
    opponent,
    nn
  );

  return result.move || getRandomMove(board, factors, turnCount, valueToIndexMap);
}

function minmax(board, factors, currentTurn, depth, isMaximizing, alpha, beta, valueToIndexMap, targetCount, me, opponent, nn) {
  // 1. 获取所有合法移动
  // 注意：开局getAllLegalMoves为null
  const possibleMoves = getAllLegalMoves(board, factors, valueToIndexMap);
  // 2. 终局判断：无路可走

  if (possibleMoves.length === 0) {
    // 如果轮到我走但没路了，我输了；如果轮到对手走没路了，我赢了
    return { score: isMaximizing ? SCORES.LOSE : SCORES.WIN };
  }

  // 3. 达到搜索深度限制，进行估值
  if (depth === 0) {
    if (nn) {
      const winProb = evaluateBoardNN(board, factors, currentTurn, targetCount, me);
      return { score: (winProb * 20000) - 10000 };
    }
    else {
      return { score: evaluateBoard(board, targetCount, me, opponent) };
    }
  }

  // 4. 预排序优化 (启发式)：优先搜索位置权重高的点，提高剪枝效率
  possibleMoves.sort((a, b) => {
    const idxA = valueToIndexMap[a.product];
    const idxB = valueToIndexMap[b.product];
    const weightA = idxA !== undefined ? POSITIONAL_WEIGHTS[idxA] : 0;
    const weightB = idxB !== undefined ? POSITIONAL_WEIGHTS[idxB] : 0;
    return weightB - weightA;
  });

  let bestMove = null;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of possibleMoves) {
      // --- 剪枝优化 A: 必胜检查 ---
      // 如果这一步能直接赢，立刻走这一步，不再搜索其他分支
      if (checkSimulatedWin(board, move.product, me, valueToIndexMap, targetCount)) {
        return { score: SCORES.WIN - (AI_SEARCH_DEPTH - depth), move: move }; // 越早赢分越高
      }
      // 模拟移动
      const idx = valueToIndexMap[move.product];
      const newBoard = [...board];
      if (idx !== undefined) {
         newBoard[idx] = { ...newBoard[idx], owner: me };
      }
      const newFactors = [...factors];
      newFactors[move.clipIndex] = move.value;
      // 递归
      const evalRes = minmax(newBoard, newFactors, currentTurn + 1, depth - 1, false, alpha, beta, valueToIndexMap, targetCount, me, opponent, nn);

      if (evalRes.score > maxEval) {
        maxEval = evalRes.score;
        bestMove = move;
      }
      alpha = Math.max(alpha, evalRes.score);
      if (beta <= alpha) break; // Beta 剪枝
    }
    // console.log(maxEval);
    // console.log(bestMove);
    return { score: maxEval, move: bestMove };
  } else {
    // Minimizing (对手回合)
    let minEval = Infinity;
    for (const move of possibleMoves) {
      // --- 剪枝优化 B: 对手必胜检查 ---
      // 如果这一步对手能直接赢，对手一定会走这一步，返回极低分
      if (checkSimulatedWin(board, move.product, opponent, valueToIndexMap, targetCount)) {
        return { score: SCORES.LOSE + (AI_SEARCH_DEPTH - depth), move: move }; // 越晚输分越高（拖延战术）
      }

      // 模拟移动
      const idx = valueToIndexMap[move.product];
      const newBoard = [...board];
      if (idx !== undefined) {
         newBoard[idx] = { ...newBoard[idx], owner: opponent };
      }
      const newFactors = [...factors];
      newFactors[move.clipIndex] = move.value;

      // 递归
      const evalRes = minmax(newBoard, newFactors, currentTurn + 1, depth - 1, true, alpha, beta, valueToIndexMap, targetCount, me, opponent, nn);

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
 * 静态评估函数,评估盘面优劣
 */
function evaluateBoard(board, targetCount, me, opponent) {
  let totalScore = 0;

  for (let i = 0; i < board.length; i++) {
    const cell = board[i];
    // 增加位置权重的比重，鼓励占据中心
    if (cell.owner === me) {
      totalScore += getCellScore(board, i, me, targetCount);
      totalScore += POSITIONAL_WEIGHTS[i] * 5;
    } else if (cell.owner === opponent) {
      // 防守系数：稍微调高对手分数的扣除比例，让AI更倾向于破坏对手的好局
      totalScore -= getCellScore(board, i, opponent, targetCount) * 3.0;
      totalScore -= POSITIONAL_WEIGHTS[i] * 5;
    }
  }
  return totalScore;
}

/**
 * 单元格评分逻辑 (后续可调数值)
 */
function getCellScore(board, index, player, targetCount) {
  let score = 0;
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

  for (let [dx, dy] of directions) {
    let count = 1;
    let openEnds = 0;
    let possible = 1;

    // 正向
    let r = row + dx, c = col + dy;
    while (isValid(r, c)) {
      const cell = board[r * GRID_SIZE + c];
      if (cell.owner === player) {
        count++;
      } else if (cell.owner === null) {
        openEnds++;
        possible++;
        // score += 2; // 稍微降低纯空位的分数，聚焦于连线
        break;
      } else {
        break;
      }
      possible++;
      r += dx; c += dy;
    }

    // 反向
    r = row - dx; c = col - dy;
    while (isValid(r, c)) {
      const cell = board[r * GRID_SIZE + c];
      if (cell.owner === player) {
        count++;
      } else if (cell.owner === null) {
        openEnds++;
        possible++;
        // score += 2;
        break;
      } else {
        break;
      }
      possible++;
      r -= dx; c -= dy;
    }

    // 如果总空间不足以连成 targetCount，则该方向无价值
    if (possible < targetCount) continue;

    // 评分阶梯优化
    if (count >= targetCount) {
      score += 100000; // 连成胜利
    } else if (count === targetCount - 1) {
      // 致命威胁 (3连/2连)：两头通的分数极高，必须处理
      score += (openEnds === 2) ? 5000 : 1500;
    } else if (count === targetCount - 2) {
       // 比如连了2个（目标4），或者1个（目标3）
      score += (openEnds === 2) ? 200 : 50;
    } else {
      score += 10;
    }
  }
  return score;
}