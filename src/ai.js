// src/ai.js
import { GRID_SIZE, FACTOR_RANGE, AI_SEARCH_DEPTH, SCORES, PLAYER, POSITIONAL_WEIGHTS } from './constants';

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
      return getGreedyMove(board, factors, turnCount, valueToIndexMap, currentWinCount, aiPlayer, opponent)
             || getRandomMove(board, factors, turnCount, valueToIndexMap);
    case 'smartGreedy':
      // [修复] 传入 aiPlayer 和 opponent
      return getSmartGreedyMove(board, factors, turnCount, valueToIndexMap, currentWinCount, aiPlayer, opponent)
             || getRandomMove(board, factors, turnCount, valueToIndexMap);
    case 'minmax':
      return getMinmaxMove(board, factors, turnCount, valueToIndexMap, currentWinCount, aiPlayer, opponent);
    default:
      return getRandomMove(board, factors, turnCount, valueToIndexMap);
  }
}

/**
 * [修复版] 高级贪心策略
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
 * [修复版] 预测对手下一回合是否能赢
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
 * 核心：模拟胜负判定
 */
function checkSimulatedWin(board, product, player, valueToIndexMap, targetCount) {
  const index = valueToIndexMap[product];
  if (index === undefined) return false;

  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

  for (let [dx, dy] of directions) {
    let count = 1;
    let r = row + dx, c = col + dy;
    while (isValid(r, c) && getOwnerAt(board, r, c, index, player) === player) {
      count++; r += dx; c += dy;
    }
    r = row - dx; c = col - dy;
    while (isValid(r, c) && getOwnerAt(board, r, c, index, player) === player) {
      count++; r -= dx; c -= dy;
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

function getMinmaxMove(board, factors, turnCount, valueToIndexMap, targetCount, me, opponent) {
  // 开局前两步分支极多，使用 smartGreedy 加速
  // 确保这里的 smartGreedy 也传入正确的 me/opponent，避免开局就送
  // if (turnCount < 2) {
  //   return getSmartGreedyMove(board, factors, turnCount, valueToIndexMap, targetCount, me, opponent)
  //          || getRandomMove(board, factors, turnCount, valueToIndexMap);
  // }

  const result = minmax(
    board,
    factors,
    AI_SEARCH_DEPTH,
    true,        // isMaximizing
    -Infinity,   // Alpha
    Infinity,    // Beta
    valueToIndexMap,
    targetCount,
    me,
    opponent
  );

  return result.move || getRandomMove(board, factors, turnCount, valueToIndexMap);
}

function minmax(board, factors, depth, isMaximizing, alpha, beta, valueToIndexMap, targetCount, me, opponent) {
  const possibleMoves = getAllLegalMoves(board, factors, valueToIndexMap);
  // 按照位置权重对移动进行预排序
  possibleMoves.sort((a, b) => {
    const idxA = valueToIndexMap[a.product];
    const idxB = valueToIndexMap[b.product];
    const weightA = idxA !== undefined ? POSITIONAL_WEIGHTS[idxA] : 0;
    const weightB = idxB !== undefined ? POSITIONAL_WEIGHTS[idxB] : 0;
    return weightB - weightA; // 权重高的排在前面
  });

  if (possibleMoves.length === 0) {
    return { score: isMaximizing ? SCORES.LOSE : SCORES.WIN };
  }

  if (depth === 0) {
    return { score: evaluateBoard(board, factors, targetCount, me, opponent, valueToIndexMap) };
  }

  let bestMove = null;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of possibleMoves) {
      // 模拟状态
      const idx = valueToIndexMap[move.product];
      const newBoard = [...board];
      if (idx !== undefined) {
         newBoard[idx] = { ...newBoard[idx], owner: me };
      }
      const newFactors = [...factors];
      newFactors[move.clipIndex] = move.value;

      // 剪枝优化：如果这步直接赢了，不用再搜了
      if (checkSimulatedWin(board, move.product, me, valueToIndexMap, targetCount)) {
        return { score: SCORES.WIN - depth, move: move };
      }

      const evalRes = minmax(newBoard, newFactors, depth - 1, false, alpha, beta, valueToIndexMap, targetCount, me, opponent);

      if (evalRes.score > maxEval) {
        maxEval = evalRes.score;
        bestMove = move;
      }
      alpha = Math.max(alpha, evalRes.score);
      if (beta <= alpha) break;
    }
    return { score: maxEval, move: bestMove };

  } else {
    let minEval = Infinity;
    for (const move of possibleMoves) {
      const idx = valueToIndexMap[move.product];
      const newBoard = [...board];
      if (idx !== undefined) {
         newBoard[idx] = { ...newBoard[idx], owner: opponent };
      }
      const newFactors = [...factors];
      newFactors[move.clipIndex] = move.value;

      // 剪枝优化：如果对手这步直接赢了，返回极低分
      if (checkSimulatedWin(board, move.product, opponent, valueToIndexMap, targetCount)) {
        return { score: SCORES.LOSE + depth, move: move };
      }

      const evalRes = minmax(newBoard, newFactors, depth - 1, true, alpha, beta, valueToIndexMap, targetCount, me, opponent);

      if (evalRes.score < minEval) {
        minEval = evalRes.score;
        bestMove = move;
      }
      beta = Math.min(beta, evalRes.score);
      if (beta <= alpha) break;
    }
    return { score: minEval, move: bestMove };
  }
}

function evaluateBoard(board, currentFactors, targetCount, me, opponent, valueToIndexMap) {
  let totalScore = 0;

  // 1. 基础检查：如果对手下一手必胜，这就是臭棋
  // 获取对手在当前滑块状态下的所有合法移动
  const opponentMoves = getAllLegalMoves(board, currentFactors, valueToIndexMap);
  for (const move of opponentMoves) {
    if (checkSimulatedWin(board, move.product, opponent, valueToIndexMap, targetCount)) {
      // return SCORES.LOSE - 100; // 极高代价，防止“送人头”
      console.log("SCORES.LOSE * 0.9", SCORES.LOSE * 0.9);
      return SCORES.LOSE * 0.9; // 发现对手能秒杀，直接判定为极差的棋
    }
  }

  // 2. 扫描棋盘评分
  for (let i = 0; i < board.length; i++) {
    const cell = board[i];
    if (cell.owner === me) {
      totalScore += getCellScore(board, i, me, targetCount);
      totalScore += POSITIONAL_WEIGHTS[i] * 2; // 加入位置权重
    } else if (cell.owner === opponent) {
      totalScore -= getCellScore(board, i, opponent, targetCount) * 2.5; // 加大防守权重
      totalScore -= POSITIONAL_WEIGHTS[i] * 2;
    }
  }
  // console.log(SCORES);
  return totalScore;
}

function getCellScore(board, index, player, targetCount) {
  let score = 0;
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]]; // 横、竖、正斜、反斜

  for (let [dx, dy] of directions) {
    let count = 1;      // 当前连续棋子数（包括自己）
    let openEnds = 0;   // 两端空位数（决定潜力）
    let possible = 1;   // 该方向上总共能连成线的潜力空间

    // --- 1. 正向探测 ---
    let r = row + dx, c = col + dy;
    while (isValid(r, c)) {
      const cell = board[r * GRID_SIZE + c];
      if (cell.owner === player) {
        count++;
      } else if (cell.owner === null) {
        openEnds++;    // 发现一个空位
        possible++;
        score += 5;
        break;         // 探测到第一个空位即停止，算作“活口”
      } else {
        break;         // 敌方棋子，此路不通
      }
      possible++;
      r += dx; c += dy;
    }

    // --- 2. 反向探测 ---
    r = row - dx; c = col - dy; // 往相反方向走
    while (isValid(r, c)) {
      const cell = board[r * GRID_SIZE + c];
      if (cell.owner === player) {
        count++;
      } else if (cell.owner === null) {
        openEnds++;    // 又发现一个空位
        possible++;
        score += 5;
        break;
      } else {
        break;
      }
      possible++;
      r -= dx; c -= dy;
    }

    // --- 3. 评分逻辑升级 ---
    // 如果总空间不足以连成 targetCount，则该方向分值为 0
    if (possible < targetCount) continue;

    if (count >= targetCount) {
      score += 10000; // 已经连成线
    } else if (count === targetCount - 1) {
      // 听牌状态：如果是“活四”（两头通），分极高；如果是一头通，分略低
      score += (openEnds === 2) ? 2000 : 500;
    } else if (count === 2) {
      // 两个棋子：两头通给 100，一头通给 30
      score += (openEnds === 2) ? 100 : 30;
    } else {
      score += 10; // 孤子
    }
  }
  return score;
}