// src/ai.js

const FACTOR_RANGE = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * 获取 AI 的下一步移动
 * @param {Array} board 棋盘状态 [{value, owner}, ...]
 * @param {Array} factors 当前因子 [f1, f2] (可能包含 null)
 * @param {Number} turnCount 当前回合数
 * @returns {Object} { clipIndex: 0|1, value: number }
 */
export function getAIMove(board, factors, turnCount) {
  // --- 策略路由 ---
  // 目前直接返回随机移动，后续可以在这里接入 Minimax
  return getRandomMove(board, factors, turnCount);
}

// 辅助：检查某个乘积是否已被占领
function isProductOccupied(board, val) {
  const cell = board.find(c => c.value === val);
  return cell && cell.owner !== null;
}

// 随机策略实现
function getRandomMove(board, factors, turnCount) {
  // 1. 特殊处理开局阶段
  if (turnCount === 0) {
    // 第一步：随便选一个 (0-1 这里的index其实无所谓，因为是放第一个)
    const randomVal = FACTOR_RANGE[Math.floor(Math.random() * FACTOR_RANGE.length)];
    return { clipIndex: 0, value: randomVal };
  }

  if (turnCount === 1) {
    // 第二步：必须选一个没被占用的乘积
    // factors[0] 已定，尝试寻找合法的 factors[1]
    const f1 = factors[0];
    const validMoves = FACTOR_RANGE.filter(num => !isProductOccupied(board, f1 * num));

    if (validMoves.length === 0) {
        // 极罕见情况：所有格子都被占了(理论上第一步不可能)，随便返回一个兜底
        return { clipIndex: 1, value: FACTOR_RANGE[0] };
    }
    const randomVal = validMoves[Math.floor(Math.random() * validMoves.length)];
    return { clipIndex: 1, value: randomVal };
  }

  // 2. 正常游戏阶段
  const possibleMoves = [];

  // 尝试移动滑块 A (index 0)
  // 固定 factors[1]，改变 factors[0] 为 num
  const fixedF2 = factors[1];
  FACTOR_RANGE.forEach(num => {
    // 规则：不能停在原来的位置 (num !== factors[0]) 且乘积不能被占领
    if (num !== factors[0] && !isProductOccupied(board, num * fixedF2)) {
      possibleMoves.push({ clipIndex: 0, value: num });
    }
  });

  // 尝试移动滑块 B (index 1)
  // 固定 factors[0]，改变 factors[1] 为 num
  const fixedF1 = factors[0];
  FACTOR_RANGE.forEach(num => {
    if (num !== factors[1] && !isProductOccupied(board, fixedF1 * num)) {
      possibleMoves.push({ clipIndex: 1, value: num });
    }
  });

  // 如果无路可走（理论上很少见，除非盘面几乎满了），则返回null让上层处理或认输
  if (possibleMoves.length === 0) return null;

  // 随机选一个合法动作
  const randomMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
  return randomMove;
}