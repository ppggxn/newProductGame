// src/neural_net.js
import weights from './model_weights.json';
import { GRID_SIZE } from './constants';

/**
 * 简单的矩阵运算库 (不依赖外部库)
 */
const MathOps = {
  // 向量点积 + 偏置
  dot: (inputVec, weightRow, bias) => {
    let sum = bias;
    // 展开循环在 JS 引擎中通常有优化，但在密集计算中 for 循环最稳
    for (let i = 0; i < inputVec.length; i++) {
      sum += inputVec[i] * weightRow[i];
    }
    return sum;
  },

  // 全连接层: Output = Activation(W * Input + b)
  dense: (input, weightMatrix, biasVector, activation = 'relu') => {
    const len = biasVector.length;
    const output = new Array(len);
    for (let i = 0; i < len; i++) {
      let val = MathOps.dot(input, weightMatrix[i], biasVector[i]);
      if (activation === 'relu') {
        output[i] = Math.max(0, val);
      } else if (activation === 'sigmoid') {
        output[i] = 1 / (1 + Math.exp(-val));
      } else {
        output[i] = val; // Linear
      }
    }
    return output;
  },

  // 归一化函数
  normalize: (val, min, max) => (val - min) / (max - min)
};

/**
 * 特征工程：将游戏状态转换为神经网络需要的 56 维数组
 * 逻辑严格对应 value_net.py 中的 state_to_tensor
 */
function getFeatures(board, factors, turnCount, winCount, currentPlayer) {
  // 1. 确定视角：神经网络总是以“当前要行动的玩家”为视角 (Canonical Form)
  // board 中: p1(owner='p1'), p2(owner='p2')
  // 如果 currentPlayer 是 'p1'，则 'p1'->1, 'p2'->-1
  // 如果 currentPlayer 是 'p2'，则 'p2'->1, 'p1'->-1

  const myName = currentPlayer;

  // 构造 36 维棋盘特征
  const boardInput = board.map(cell => {
    if (cell.owner === null) return 0;
    // 如果是我的子，标记为 1；如果是对手的子，标记为 -1
    return cell.owner === myName ? 1.0 : -1.0;
  });

  // 2. 滑块 One-Hot 编码 (9 + 9 = 18维)
  const f1Input = Array(9).fill(0.0);
  const f2Input = Array(9).fill(0.0);

  // 你的 python 代码: factors 索引需减 1 (1->0, 9->8)
  // 注意处理 null (开局时可能为 null)
  if (factors[0] && factors[0] >= 1 && factors[0] <= 9) f1Input[factors[0] - 1] = 1.0;
  if (factors[1] && factors[1] >= 1 && factors[1] <= 9) f2Input[factors[1] - 1] = 1.0;

  // 3. 归一化标量
  // 对应 Python: norm_turn = turn_count / 36.0
  const normTurn = turnCount / (GRID_SIZE * GRID_SIZE);

  // 对应 Python: norm_win_count = (win_count - 3) / 3.0
  // 假设 winCount 范围是 3-6，分母为 3.0
  const normWin = (winCount - 3.0) / 3.0;

  // 拼接所有特征 (36 + 9 + 9 + 1 + 1 = 56)
  return [
    ...boardInput,
    ...f1Input,
    ...f2Input,
    normTurn,
    normWin
  ];
}

/**
 * 神经网络评估主入口
 * @returns {number} 胜率 (0.0 ~ 1.0)，代表 currentPlayer 获胜的概率
 */
export function evaluateBoardNN(board, factors, turnCount, winCount, currentPlayer) {
  const input = getFeatures(board, factors, turnCount, winCount, currentPlayer);

  // 你的 ValueNet 结构:
  // Input(56) -> FC1(128, ReLU) -> FC2(64, ReLU) -> FC3(32, ReLU) -> Output(1, Sigmoid)
  // 注意：Dropout 在推理阶段不执行

  // Layer 1: 56 -> 128
  const h1 = MathOps.dense(input, weights['fc1.weight'], weights['fc1.bias'], 'relu');

  // Layer 2: 128 -> 64
  const h2 = MathOps.dense(h1, weights['fc2.weight'], weights['fc2.bias'], 'relu');

  // Layer 3: 64 -> 32
  const h3 = MathOps.dense(h2, weights['fc3.weight'], weights['fc3.bias'], 'relu');

  // Layer 4: 32 -> 1 (Sigmoid)
  const output = MathOps.dense(h3, weights['output.weight'], weights['output.bias'], 'sigmoid');

  return output[0];
}