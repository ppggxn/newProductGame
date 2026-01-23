import { useState, useEffect, useRef } from 'react';
import './App.css';
import { getAIMove } from './ai';

const GRID_SIZE = 6;
const WIN_COUNT = 3;
const FACTOR_RANGE = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function App() {
  const [board, setBoard] = useState([]);
  const [factors, setFactors] = useState([null, null]);
  const [activeClip, setActiveClip] = useState(null);
  const [turnCount, setTurnCount] = useState(0);
  const [currentPlayer, setCurrentPlayer] = useState('p1');
  const [winner, setWinner] = useState(null);
  const [winningLine, setWinningLine] = useState([]); // 新增：存储获胜连线的索引
  const [msg, setMsg] = useState("Player 1 请放置第 1 个滑块");

  // --- 新增状态：控制器设置 ---
  // --- 新增状态：玩家类型 'human' 或 'ai' ---
  const [playerTypes, setPlayerTypes] = useState({ p1: 'human', p2: 'human' });


  // 使用 useEffect 处理 AI 自动走棋逻辑
  useEffect(() => {
    // 如果游戏结束，或当前玩家是人类，则不作为
    if (winner || playerTypes[currentPlayer] === 'human') return;

    // 设置思考时间 (1000ms)，模拟 AI 思考，也方便观众看清
    const timer = setTimeout(() => {
      performAIMove();
    }, 1000);

    return () => clearTimeout(timer);
  }, [currentPlayer, playerTypes, winner, board, factors, turnCount]); // 依赖项要全，确保状态更新触发 Effect

  const startNewGame = () => {
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
    setFactors([null, null]);
    setTurnCount(0);
    setActiveClip(null);
    setCurrentPlayer('p1');
    setWinner(null);
    setWinningLine([]); // 重置连线
    setMsg("游戏开始！Player 1 请放置第 1 个滑块 (A)");
  };


  // --- 新增：执行 AI 移动 ---
  const performAIMove = () => {
    const move = getAIMove(board, factors, turnCount);

    if (!move) {
      setMsg("AI 投降了 (无路可走)");
      return;
    }

    const { clipIndex, value } = move;

    // 模拟 UI 反馈：选中要移动的滑块（可选，为了视觉效果）
    setActiveClip(clipIndex);

    // 短暂延迟后真正落子，让"选中滑块"这个动作被看到（可选，更拟人）
    // 这里为了代码简单，直接执行落子

    // 构建新的 factors
    const newFactors = [...factors];
    newFactors[clipIndex] = value;

    // 更新状态
    setFactors(newFactors);
    setActiveClip(null); // 移动完取消选中

    // 处理回合逻辑
    if (turnCount === 0) {
      setTurnCount(1);
      setCurrentPlayer('p2');
      setMsg("轮到 Player 2 (AI)...");
    } else if (turnCount === 1) {
      setTurnCount(2);
      attemptMove(newFactors, 'p2'); // P2 落子，attemptMove 会自动切换回 P1
    } else {
      attemptMove(newFactors, currentPlayer);
    }
  };

    // --- 新增：切换玩家类型 ---
  const togglePlayerType = (p) => {
    setPlayerTypes(prev => ({
      ...prev,
      [p]: prev[p] === 'human' ? 'ai' : 'human'
    }));
  };

    // 辅助：检查乘积是否被占
  const isProductOccupied = (val) => {
      const cell = board.find(c => c.value === val);
      return cell && cell.owner !== null;
  };


  const handleNumberClick = (num) => {
    // 如果当前是 AI 回合，禁止人类点击操作
    if (playerTypes[currentPlayer] === 'ai' && !winner) return;
    if (winner) return;

    // --- 开局逻辑 ---
    if (turnCount === 0) {
      setFactors([num, null]);
      setTurnCount(1);
      setCurrentPlayer('p2');
      setMsg("轮到 Player 2：请放置第 2 个滑块 (B)");
      return;
    }
    if (turnCount === 1) {
      // 检查这一步是否合法（其实开局第二步很难被占，但为了逻辑统一还是检查下）
      // 此时 factors[0] 已定，num 是 factors[1]
      const potentialProduct = factors[0] * num;
      if (isProductOccupied(potentialProduct)) {
        setMsg(`位置 ${potentialProduct} 已被占领，请选择其他数字！`);
        return;
      }

      const newFactors = [factors[0], num];
      setFactors(newFactors);
      setTurnCount(2);
      attemptMove(newFactors, 'p2');
      return;
    }

    // --- 正常回合逻辑 ---

    // 1. 如果还没选中滑块
    if (activeClip === null) {
      if (num === factors[0] && num !== factors[1]) {
        setActiveClip(0);
        setMsg(`已选中滑块 A (${num})`);
      } else if (num === factors[1] && num !== factors[0]) {
        setActiveClip(1);
        setMsg(`已选中滑块 B (${num})`);
      } else if (num === factors[0] && num === factors[1]) {
        setActiveClip(0);
        setMsg(`已选中其中一个滑块`);
      } else {
        setMsg("⚠️ 请先点击你要移动的那个滑块（Paperclip）！");
      }
      return;
    }

    // 2. 如果已选中滑块，准备移动
    const newFactors = [...factors];
    newFactors[activeClip] = num;
    const newProduct = newFactors[0] * newFactors[1];

    // --- 新增逻辑：检查目标位置是否已被占领 ---
    if (isProductOccupied(newProduct)) {
        setMsg(`❌ 无法移动：位置 ${newProduct} 已被占领！`);
        // 这里可以选择震动效果，或者只是拒绝操作
        return;
    }

    // 执行移动
    setFactors(newFactors);
    setActiveClip(null);
    attemptMove(newFactors, currentPlayer);
  };


  const attemptMove = (currentFactors, playerWhoMoved) => {
    const product = currentFactors[0] * currentFactors[1];
    const index = board.findIndex(cell => cell.value === product);
    const targetCell = board[index];

    // 双重保险，理论上 handleNumberClick 已经拦截了
    if (targetCell.owner) {
      setMsg(`错误：位置 ${product} 已经被占领了。`);
      return;
    }

    const newBoard = [...board];
    newBoard[index] = { ...targetCell, owner: playerWhoMoved };
    setBoard(newBoard);

    // 判定胜负 (现在接收返回的连线数组)
    const winLine = getWinningLine(newBoard, index, playerWhoMoved);
    if (winLine) {
      setWinner(playerWhoMoved);
      setWinningLine(winLine); // 保存连线索引以供高亮
      setMsg(`🎉 ${playerWhoMoved === 'p1' ? 'Player 1' : 'Player 2'} 获胜!`);
    } else if (newBoard.every(cell => cell.owner !== null)) {
      setWinner('draw');
    } else {
      const next = playerWhoMoved === 'p1' ? 'p2' : 'p1';
      setCurrentPlayer(next);
      // 修改这里：提示信息根据下一位是人还是AI变化
      const nextType = playerTypes[next];
      setMsg(`轮到 ${next === 'p1' ? 'Player 1' : 'Player 2'} (${nextType === 'ai' ? 'AI 思考中...' : '请操作'})`);
    }
  };

  // 修改后的判定函数：返回连线索引数组，如果没有则返回 null
  const getWinningLine = (currentBoard, lastIndex, player) => {
    const row = Math.floor(lastIndex / GRID_SIZE);
    const col = lastIndex % GRID_SIZE;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

    for (let [dx, dy] of directions) {
      let line = [lastIndex]; // 包含当前点

      // 正向搜
      let r = row + dx, c = col + dy;
      while (isValid(r, c) && currentBoard[r * GRID_SIZE + c].owner === player) {
        line.push(r * GRID_SIZE + c);
        r += dx; c += dy;
      }
      // 反向搜
      r = row - dx; c = col - dy;
      while (isValid(r, c) && currentBoard[r * GRID_SIZE + c].owner === player) {
        line.push(r * GRID_SIZE + c);
        r -= dx; c -= dy;
      }

      if (line.length >= WIN_COUNT) return line;
    }
    return null;
  };

  const isValid = (r, c) => r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;

  return (
    <div className="game-container">
      <div className="header">
        <h1>New Product Game</h1>
        <div className="info-panel">
            {/* 1. 左侧占位，确保中间居中 */}
            <div className="panel-spacer"></div>

            {/* 2. 中间玩家徽章 */}
            <div className="badges-container">
                {/* 给 Badge 添加点击事件，显示 🤖 图标 */}
                <div
                    className={`player-badge p1 ${currentPlayer==='p1'?'active':''} clickable`}
                    onClick={() => togglePlayerType('p1')}
                    title="点击切换 人类/AI"
                >
                    {playerTypes.p1 === 'ai' ? '🤖 AI-1' : '👤 Player 1'}
                </div>

                <div
                    className={`player-badge p2 ${currentPlayer==='p2'?'active':''} clickable`}
                    onClick={() => togglePlayerType('p2')}
                    title="点击切换 人类/AI"
                >
                    {playerTypes.p2 === 'ai' ? '🤖 AI-2' : '👤 Player 2'}
                </div>
            </div>

            {/* 3. 右侧重置按钮 */}
            <div className="panel-right">
                <button className="reset-btn-mini" onClick={startNewGame} title="重置游戏">
                    ↺
                </button>
            </div>
        </div>
        <div className="message-box">{msg}</div>
      </div>

      <div className="board">
        {board.map((cell, idx) => {
          // 判断是否是获胜连线的一部分
          const isWinningCell = winningLine.includes(idx);
          return (
            <div
                key={idx}
                className={`cell ${cell.owner || ''} ${isWinningCell ? 'winning' : ''}`}
            >
                {cell.value}
            </div>
          );
        })}
      </div>

      {/* 底部控制区：如果是 AI 回合，可以加个遮罩或者禁用点击，这里简单处理不禁用视觉，但在 onClick 里拦截了 */}
      <div className={`controls-area ${playerTypes[currentPlayer] === 'ai' ? 'ai-turn' : ''}`}>
        <p className="product-display">
            当前乘积:
            <span className="math-text">
              {factors[0] && factors[1]
                ? `${factors[0]} × ${factors[1]} = ${factors[0]*factors[1]}`
                : 'Waiting...'}
            </span>
        </p>

        <div className="track-container">
            <div className="track-numbers">
                {FACTOR_RANGE.map(num => {
                    let isForbidden = false;
                    if (activeClip !== null && !winner && playerTypes[currentPlayer] === 'human') { // 只有人类回合才显示禁手
                        const otherFactor = factors[activeClip === 0 ? 1 : 0];
                        if (isProductOccupied(num * otherFactor)) isForbidden = true;
                    }

                    return (
                        <div
                            key={num}
                            className={`track-number ${isForbidden ? 'forbidden' : ''}`}
                            onClick={() => !isForbidden && handleNumberClick(num)}
                        >
                            {num}
                        </div>
                    )
                })}
            </div>

            <div
                className={`paperclip clip-a ${activeClip === 0 ? 'active' : ''}`}
                style={{ display: factors[0] ? 'flex' : 'none', left: `calc(${(factors[0] - 1) * 11.11}% + 2%)`, zIndex: activeClip === 0 ? 20 : 10 }}
                onClick={(e) => {
                    e.stopPropagation();
                    if (turnCount < 2 || playerTypes[currentPlayer] === 'ai') return; // AI 回合禁点
                    if (activeClip === 1) { handleNumberClick(factors[0]); return; }
                    setActiveClip(0);
                    setMsg("已拿起滑块 A");
                }}
            >A</div>

            <div
                className={`paperclip clip-b ${activeClip === 1 ? 'active' : ''}`}
                style={{ display: factors[1] ? 'flex' : 'none', left: `calc(${(factors[1] - 1) * 11.11}% + 2%)`, zIndex: activeClip === 1 ? 20 : 10 }}
                onClick={(e) => {
                    e.stopPropagation();
                    if (turnCount < 2 || playerTypes[currentPlayer] === 'ai') return;
                    if (activeClip === 0) { handleNumberClick(factors[1]); return; }
                    setActiveClip(1);
                    setMsg("已拿起滑块 B");
                }}
            >B</div>
        </div>
      </div>
    </div>
  );
}