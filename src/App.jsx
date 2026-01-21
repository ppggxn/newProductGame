import { useState, useEffect } from 'react';
import './App.css';

const GRID_SIZE = 6;
const WIN_COUNT = 3;
const FACTOR_RANGE = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function App() {
  const [board, setBoard] = useState([]);

  // factors: [因子A, 因子B]
  const [factors, setFactors] = useState([null, null]);

  // activeClip: 当前正在操作哪个滑块？ (0 或 1, null 表示未选中)
  const [activeClip, setActiveClip] = useState(null);

  // turnCount: 记录回合数，用于判断是否是第一回合
  // 0: 游戏开始，需放置第1个
  // 1: 需放置第2个 (此时仍是 P1)
  // 2+: 正常游戏，每回合动1个
  const [turnCount, setTurnCount] = useState(0);

  const [currentPlayer, setCurrentPlayer] = useState('p1');
  const [winner, setWinner] = useState(null);
  const [msg, setMsg] = useState("请 Player 1 放置第一个滑块");

  useEffect(() => {
    startNewGame();
  }, []);

  const startNewGame = () => {
    // 初始化棋盘 (同前)
    const products = new Set();
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        products.add(i * j);
      }
    }
    const shuffledProducts = Array.from(products);
    for (let i = shuffledProducts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledProducts[i], shuffledProducts[j]] = [shuffledProducts[j], shuffledProducts[i]];
    }

    setBoard(shuffledProducts.map(val => ({ value: val, owner: null })));
    setFactors([1, 1]); // 初始滑块位置放在 1,1 (或者 null 也可以，这里为了UI显示方便设为1)
    setTurnCount(0);
    setActiveClip(null); // 还没选中滑块
    setCurrentPlayer('p1');
    setWinner(null);
    setMsg("游戏开始！Player 1 请放置第 1 个滑块");
  };

  // 点击底部数字条
  const handleNumberClick = (num) => {
    if (winner) return;

    // --- 第一回合逻辑 (Player 1 只有开局有权动两个) ---
    if (turnCount === 0) {
      // 放置第一个滑块
      setFactors([num, factors[1]]);
      setTurnCount(1);
      setMsg("Player 1 请放置第 2 个滑块");
      return;
    }
    if (turnCount === 1) {
      // 放置第二个滑块 -> 触发落子 -> 换人
      const newFactors = [factors[0], num];
      setFactors(newFactors);
      setTurnCount(2);
      attemptMove(newFactors, 'p1');
      return;
    }

    // --- 正常回合逻辑 (只能移动一个) ---

    // 如果还没选中要移动哪个滑块，提示用户
    if (activeClip === null) {
      // 检查用户点的数字是否是当前滑块所在位置
      // 如果点击了某个滑块的位置，就自动选中它
      if (num === factors[0] && num !== factors[1]) {
        setActiveClip(0);
        setMsg(`已选中滑块 A (${num})，请点击新数字移动它`);
      } else if (num === factors[1] && num !== factors[0]) {
        setActiveClip(1);
        setMsg(`已选中滑块 B (${num})，请点击新数字移动它`);
      } else if (num === factors[0] && num === factors[1]) {
        // 两个滑块重叠时，默认选第一个
        setActiveClip(0);
        setMsg(`已选中其中一个滑块，请点击新数字移动它`);
      } else {
        setMsg("⚠️ 请先点击你要移动的那个滑块（Paperclip）！");
      }
      return;
    }

    // 如果已经选中了滑块 (activeClip !== null)，执行移动
    const newFactors = [...factors];
    newFactors[activeClip] = num;

    // 移动滑块后，立即尝试落子
    setFactors(newFactors);
    setActiveClip(null); // 移动完毕，取消选中状态
    attemptMove(newFactors, currentPlayer);
  };

  // 尝试落子
  const attemptMove = (currentFactors, playerWhoMoved) => {
    const product = currentFactors[0] * currentFactors[1];
    const index = board.findIndex(cell => cell.value === product);
    const targetCell = board[index];

    if (targetCell.owner) {
      setMsg(`位置 ${product} 已被占领！但这回合你只能停在这儿了。换人。`);
      // 即使被占领，也得切换回合 (原版规则通常是：如果不幸算出已被占领的数，你就这回合白干了)
      switchTurn(playerWhoMoved);
      return;
    }

    // 落子
    const newBoard = [...board];
    newBoard[index] = { ...targetCell, owner: playerWhoMoved };
    setBoard(newBoard);

    // 判定
    if (checkWin(newBoard, index, playerWhoMoved)) {
      setWinner(playerWhoMoved);
      setMsg(`🎉 ${playerWhoMoved === 'p1' ? 'Player 1' : 'Player 2'} 获胜!`);
    } else if (newBoard.every(cell => cell.owner !== null)) {
      setWinner('draw');
    } else {
      switchTurn(playerWhoMoved);
    }
  };

  const switchTurn = (current) => {
    const next = current === 'p1' ? 'p2' : 'p1';
    setCurrentPlayer(next);
    setMsg(`轮到 ${next === 'p1' ? 'Player 1' : 'Player 2'} (点击滑块以移动)`);
  };

  // 连线判定 (保持不变)
  const checkWin = (currentBoard, lastIndex, player) => {
    const row = Math.floor(lastIndex / GRID_SIZE);
    const col = lastIndex % GRID_SIZE;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let [dx, dy] of directions) {
      let count = 1;
      let r = row + dx, c = col + dy;
      while (isValid(r, c) && currentBoard[r * GRID_SIZE + c].owner === player) { count++; r += dx; c += dy; }
      r = row - dx; c = col - dy;
      while (isValid(r, c) && currentBoard[r * GRID_SIZE + c].owner === player) { count++; r -= dx; c -= dy; }
      if (count >= WIN_COUNT) return true;
    }
    return false;
  };
  const isValid = (r, c) => r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;

  return (
    <div className="game-container">
      <div className="header">
        <h1>Product Game</h1>
        <div className="info-panel">
            <div className={`player-badge p1 ${currentPlayer==='p1'?'active':''}`}>Player 1</div>
            <div className={`player-badge p2 ${currentPlayer==='p2'?'active':''}`}>Player 2</div>
        </div>
        <div className="message-box">{msg}</div>
      </div>

      {/* 棋盘区 */}
      <div className="board">
        {board.map((cell, idx) => (
          <div key={idx} className={`cell ${cell.owner || ''}`}>
            {cell.value}
          </div>
        ))}
      </div>

{/* 滑块控制区 */}
      <div className="controls-area">
        <p className="product-display">
            当前乘积:
            <span className="math-text"> {factors[0]} × {factors[1]} = {factors[0]*factors[1]} </span>
        </p>

        <div className="track-container">
            {/* 1-9 数字底座 (保持不变) */}
            <div className="track-numbers">
                {FACTOR_RANGE.map(num => (
                    <div
                        key={num}
                        className="track-number"
                        onClick={() => handleNumberClick(num)}
                    >
                        {num}
                    </div>
                ))}
            </div>

            {/* --- 修复后的滑块 A --- */}
            <div
                className={`paperclip clip-a ${activeClip === 0 ? 'active' : ''}`}
                style={{
                    left: `calc(${(factors[0] - 1) * 11.11}% + 2%)`,
                    zIndex: activeClip === 0 ? 20 : 10 // 选中的滑块层级更高
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    if (turnCount < 2) return;

                    // 【修复逻辑】: 如果当前正在拿着滑块 B (activeClip === 1)
                    // 点击滑块 A 意味着要把 B 移到 A 的位置 (重叠)
                    if (activeClip === 1) {
                        handleNumberClick(factors[0]); // 触发移动逻辑
                        return;
                    }

                    // 否则，正常选中 A
                    setActiveClip(0);
                    setMsg("已拿起滑块 A，请点击新数字放置");
                }}
            >
                A
            </div>

            {/* --- 修复后的滑块 B --- */}
            <div
                className={`paperclip clip-b ${activeClip === 1 ? 'active' : ''}`}
                style={{
                    left: `calc(${(factors[1] - 1) * 11.11}% + 2%)`,
                    zIndex: activeClip === 1 ? 20 : 10
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    if (turnCount < 2) return;

                    // 【修复逻辑】: 如果当前正在拿着滑块 A (activeClip === 0)
                    // 点击滑块 B 意味着要把 A 移到 B 的位置 (重叠)
                    if (activeClip === 0) {
                        handleNumberClick(factors[1]); // 触发移动逻辑
                        return;
                    }

                    // 否则，正常选中 B
                    setActiveClip(1);
                    setMsg("已拿起滑块 B，请点击新数字放置");
                }}
            >
                B
            </div>
        </div>
      </div>

      <button className="reset-btn" onClick={startNewGame}>重置游戏</button>
    </div>
  );
}