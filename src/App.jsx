import { useState, useEffect, useMemo } from 'react';
import './App.css';
import { getAIMove } from './ai';
import { translations } from './i18n';
import { GRID_SIZE, WIN_COUNT as DEFAULT_WIN_COUNT, FACTOR_RANGE, THINKING_TIME } from './constants';

// --- 模态框组件 ---
const SettingsModal = ({ isOpen, onClose, winCount, setWinCount, difficulty, setDifficulty, lang, setLang, onReset }) => {
  if (!isOpen) return null;

  const stats = JSON.parse(localStorage.getItem('npg_stats') || '{"humanWins":0, "aiWins":0, "total":0}');
  const winRate = stats.total > 0 ? Math.round((stats.humanWins / stats.total) * 100) : 0;

  const handleWinCountChange = (num) => {
    if (num === winCount) return;
    setWinCount(num);
    // 规则改变后，强制重置游戏，避免逻辑冲突
    onReset();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{translations[lang].settings}</h2>
          <button className={"language-btn"} onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            <svg viewBox="0 0 640 512"><path fill="currentcolor" d="M0 128C0 92.7 28.7 64 64 64H256h48 16H576c35.3.0 64 28.7 64 64V384c0 35.3-28.7 64-64 64H320 304 256 64c-35.3.0-64-28.7-64-64V128zm320 0V384H576V128H320zM178.3 175.9c-3.2-7.2-10.4-11.9-18.3-11.9s-15.1 4.7-18.3 11.9l-64 144c-4.5 10.1.1 21.9 10.2 26.4s21.9-.1 26.4-10.2l8.9-20.1h73.6l8.9 20.1c4.5 10.1 16.3 14.6 26.4 10.2s14.6-16.3 10.2-26.4l-64-144zM160 233.2 179 276H141l19-42.8zM448 164c11 0 20 9 20 20v4h44 16c11 0 20 9 20 20s-9 20-20 20h-2l-1.6 4.5c-8.9 24.4-22.4 46.6-39.6 65.4.9.6 1.8 1.1 2.7 1.6l18.9 11.3c9.5 5.7 12.5 18 6.9 27.4s-18 12.5-27.4 6.9L467 333.8c-4.5-2.7-8.8-5.5-13.1-8.5-10.6 7.5-21.9 14-34 19.4l-3.6 1.6c-10.1 4.5-21.9-.1-26.4-10.2s.1-21.9 10.2-26.4l3.6-1.6c6.4-2.9 12.6-6.1 18.5-9.8L410 286.1c-7.8-7.8-7.8-20.5.0-28.3s20.5-7.8 28.3.0l14.6 14.6.5.5c12.4-13.1 22.5-28.3 29.8-45H448 376c-11 0-20-9-20-20s9-20 20-20h52v-4c0-11 9-20 20-20z"></path></svg>
          </button>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {/* 1. 胜利条件设置 */}
        <div className="modal-section">
          <h3>{translations[lang].winCount}</h3>
          <div className="segmented-control">
            {[3, 4, 5, 6].map(num => (
              <button
                key={num}
                className={`segment-btn ${winCount === num ? 'active' : ''}`}
                onClick={() => handleWinCountChange(num)}
              >
                {num}
              </button>
            ))}
          </div>
          <p style={{fontSize: '0.8rem', color: '#666', marginTop: '5px'}}>
             * {translations[lang].warning}
          </p>
        </div>

        {/* AI 难度, 统计面板 */}
        <div className="modal-section">
          <h3>{translations[lang].difficulty}</h3>
          <div className="segmented-control">
            {['random', 'greedy', 'minimax'].map(mode => (
              <button
                key={mode}
                className={`segment-btn ${difficulty === mode ? 'active' : ''}`}
                onClick={() => setDifficulty(mode)}
                title={mode}
              >
                {mode === 'random' ? translations[lang].difficultyEasy : mode === 'greedy' ? translations[lang].difficultyNormal : translations[lang].difficultyHard}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-section">
          <h3>{translations[lang].stats}</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{stats.humanWins} / {stats.total}</span>
              <span className="stat-label">{translations[lang].statsNum}</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{winRate}%</span>
              <span className="stat-label">{translations[lang].winRate}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

const generateInitialBoard = () => {
  const products = new Set();
  for (let i = 1; i <= 9; i++) {
    for (let j = 1; j <= 9; j++) products.add(i * j);
  }
  const shuffledProducts = Array.from(products);
  for (let i = shuffledProducts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledProducts[i], shuffledProducts[j]] = [shuffledProducts[j], shuffledProducts[i]];
  }
  return shuffledProducts.map(val => ({ value: val, owner: null }));
};

export default function App() {
  const [lang, setLang] = useState('en'); // 语言状态
  const [board, setBoard] = useState(() => generateInitialBoard());
  const [factors, setFactors] = useState([null, null]);
  const [activeClip, setActiveClip] = useState(null);
  const [turnCount, setTurnCount] = useState(0);
  const [currentPlayer, setCurrentPlayer] = useState('p1');
  const [winner, setWinner] = useState(null);
  const [winningLine, setWinningLine] = useState([]);
  const [playerTypes, setPlayerTypes] = useState({ p1: 'human', p2: 'human' });
  // --- 新增 UI State ---
  const [showSettings, setShowSettings] = useState(false);
  // 【核心修改】settingWinCount 现在是游戏的实际规则来源
  // 使用 DEFAULT_WIN_COUNT 作为初始值
  const [settingWinCount, setSettingWinCount] = useState(DEFAULT_WIN_COUNT);
  const [aiDifficulty, setAiDifficulty] = useState('random');

  // 生成高频查找映射表Value-to-Index Map (O(1) 查找)
  // 仅在 board 数组引用变化（即重新开局）时重新计算
  const valueToIndexMap = useMemo(() => {
    const map = {};
    board.forEach((cell, idx) => {
      map[cell.value] = idx;
    });
    return map;
  }, [board]);

  // 3. 核心：msg 现在存对象
  const [msgObj, setMsgObj] = useState({ key: 'startMsg' });

  const t = translations[lang];

  // 4. 解析消息的工具函数
  const getParsedMsg = (obj) => {
    let text = t[obj.key] || obj.key;
    if (obj.params) {
      Object.keys(obj.params).forEach(p => {
        text = text.replace(`{{${p}}}`, obj.params[p]);
      });
    }
    return text;
  };

  useEffect(() => {
    if (winner || playerTypes[currentPlayer] === 'human') return;
    // 内置延迟模拟思考过程
    const timer = setTimeout(() => performAIMove(), THINKING_TIME);
    return () => clearTimeout(timer);
  }, [currentPlayer, playerTypes, winner, board, factors, turnCount, valueToIndexMap, settingWinCount]);

  const startNewGame = () => {
    setBoard(generateInitialBoard());
    setFactors([null, null]);
    setTurnCount(0);
    setActiveClip(null);
    setCurrentPlayer('p1');
    setWinner(null);
    setWinningLine([]);
    setMsgObj({ key: 'startMsg' });
  };

  const performAIMove = () => {
    // 传入映射表
    const move = getAIMove(board, factors, turnCount, valueToIndexMap, settingWinCount);
    if (!move) {
      setMsgObj({ key: 'aiSurrender' });
      return;
    }
    const { clipIndex, value } = move;
    setActiveClip(clipIndex);
    const newFactors = [...factors];
    newFactors[clipIndex] = value;
    setFactors(newFactors);
    setActiveClip(null);

    if (turnCount === 0) {
      setTurnCount(1);
      setCurrentPlayer('p2');
      setMsgObj({ key: 'aiThinkingMsg', params: { player: t.p2 } });
    } else if (turnCount === 1) {
      setTurnCount(2);
      attemptMove(newFactors, 'p2');
    } else {
      attemptMove(newFactors, currentPlayer);
    }
  };

  const togglePlayerType = (p) => {
    setPlayerTypes(prev => ({ ...prev, [p]: prev[p] === 'human' ? 'ai' : 'human' }));
  };

  const isProductOccupied = (val) => {
    const index = valueToIndexMap[val];
    // 增加可选链 ?. 确保安全
    return board[index]?.owner !== null;
  };

  const handleNumberClick = (num) => {
    if (playerTypes[currentPlayer] === 'ai' && !winner) return;
    if (winner) return;

    if (turnCount === 0) {
      setFactors([num, null]);
      setTurnCount(1);
      setCurrentPlayer('p2');
      setMsgObj({ key: 'placeB' });
      return;
    }
    if (turnCount === 1) {
      const potProd = factors[0] * num;
      if (isProductOccupied(potProd)) {
        setMsgObj({ key: 'occupied', params: { val: potProd } });
        return;
      }
      const newFactors = [factors[0], num];
      setFactors(newFactors);
      setTurnCount(2);
      attemptMove(newFactors, 'p2');
      return;
    }

    if (activeClip === null) {
      if (num === factors[0] && num !== factors[1]) {
        setActiveClip(0);
        setMsgObj({ key: 'pickA', params: { val: num } });
      } else if (num === factors[1] && num !== factors[0]) {
        setActiveClip(1);
        setMsgObj({ key: 'pickB', params: { val: num } });
      } else if (num === factors[0] && num === factors[1]) {
        setActiveClip(0);
        setMsgObj({ key: 'pickEither' });
      } else {
        setMsgObj({ key: 'needSelect' });
      }
      return;
    }

    const newFactors = [...factors];
    newFactors[activeClip] = num;
    const newProduct = newFactors[0] * newFactors[1];

    if (isProductOccupied(newProduct)) {
      setMsgObj({ key: 'forbidden', params: { val: newProduct } });
      return;
    }

    setFactors(newFactors);
    setActiveClip(null);
    attemptMove(newFactors, currentPlayer);
  };

  const attemptMove = (currentFactors, playerWhoMoved) => {
    const product = currentFactors[0] * currentFactors[1];
    const index = board.findIndex(cell => cell.value === product);
    const newBoard = [...board];
    newBoard[index] = { ...board[index], owner: playerWhoMoved };
    setBoard(newBoard);

    const winLine = getWinningLine(newBoard, index, playerWhoMoved);
    if (winLine) {
      setWinner(playerWhoMoved);
      setWinningLine(winLine);
      setMsgObj({ key: 'win', params: { player: t[playerWhoMoved] } });
    } else if (newBoard.every(cell => cell.owner !== null)) {
      setWinner('draw');
      setMsgObj({ key: 'draw' });
    } else {
      const next = playerWhoMoved === 'p1' ? 'p2' : 'p1';
      setCurrentPlayer(next);
      const nextType = playerTypes[next];
      setMsgObj({
        key: nextType === 'ai' ? 'aiThinkingMsg' : 'humanTurnMsg',
        params: { player: t[next] }
      });
    }
  };

  const getWinningLine = (currentBoard, lastIndex, player) => {
    const row = Math.floor(lastIndex / GRID_SIZE);
    const col = lastIndex % GRID_SIZE;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
      // 使用当前的状态 settingWinCount
    const targetCount = settingWinCount;

    for (let [dx, dy] of directions) {
      let line = [lastIndex];
      let r = row + dx, c = col + dy;
      while (isValid(r, c) && currentBoard[r * GRID_SIZE + c].owner === player) { line.push(r * GRID_SIZE + c); r += dx; c += dy; }
      r = row - dx; c = col - dy;
      while (isValid(r, c) && currentBoard[r * GRID_SIZE + c].owner === player) { line.push(r * GRID_SIZE + c); r -= dx; c -= dy; }
      if (line.length >= targetCount) return line;
    }
    return null;
  };
  const isValid = (r, c) => r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;

  return (
    <div className="game-container">
      {/* 渲染模态框 */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        winCount={settingWinCount}
        setWinCount={setSettingWinCount}
        difficulty={aiDifficulty}
        setDifficulty={setAiDifficulty}
        lang={lang}
        setLang={setLang}
        onReset={startNewGame} // 传递重置函数
      />
      <div className="header">
        {/* 将重置功能绑定到标题，增加 pointer 样式 */}
        <h1 onClick={startNewGame} style={{ cursor: 'pointer' }} title={t.reset}>
          {t.title}
        </h1>
        <div className="info-panel">
            <div className="panel-placeholder"></div>
            <div className="badges-container">
                <div className={`player-badge p1 ${currentPlayer==='p1'?'active':''} clickable`} onClick={() => togglePlayerType('p1')}>
                    {playerTypes.p1 === 'ai' ? `🤖 ${t.ai}-1` : `👤 ${t.p1}`}
                </div>
                <div className={`player-badge p2 ${currentPlayer==='p2'?'active':''} clickable`} onClick={() => togglePlayerType('p2')}>
                    {playerTypes.p2 === 'ai' ? `🤖 ${t.ai}-2` : `👤 ${t.p2}`}
                </div>
            </div>
            <div className="panel-right">
              <button className="settings-btn" onClick={() => setShowSettings(true)} title="Settings">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
          </button>
            </div>
        </div>
        <div className="message-box">{getParsedMsg(msgObj)}</div>
      </div>

      <div className="board">
        {board.map((cell, idx) => (
          <div key={idx} className={`cell ${cell.owner || ''} ${winningLine.includes(idx) ? 'winning' : ''}`}>
            {cell.value}
          </div>
        ))}
      </div>

      <div className={`controls-area ${playerTypes[currentPlayer] === 'ai' ? 'ai-turn' : ''}`}>
        <p className="product-display">
            {t.currentProduct}:
            <span className="math-text">
              {factors[0] && factors[1] ? `${factors[0]} × ${factors[1]} = ${factors[0]*factors[1]}` : t.waiting}
            </span>
        </p>
        <div className="track-container">
            <div className="track-numbers">
                {FACTOR_RANGE.map(num => {
                    let isForbidden = false;
                    if (activeClip !== null && !winner && playerTypes[currentPlayer] === 'human') {
                        if (isProductOccupied(num * factors[activeClip === 0 ? 1 : 0])) isForbidden = true;
                    }
                    return (
                        <div key={num} className={`track-number ${isForbidden ? 'forbidden' : ''}`} onClick={() => !isForbidden && handleNumberClick(num)}>
                            {num}
                        </div>
                    )
                })}
            </div>
            {/* 滑块 A/B 保持不变... */}
            <div className={`paperclip clip-a ${activeClip === 0 ? 'active' : ''}`} style={{ display: factors[0] ? 'flex' : 'none', left: `calc(${(factors[0] - 1) * 11.11}% + 2%)` }} onClick={(e) => { e.stopPropagation(); if (turnCount < 2 || playerTypes[currentPlayer] === 'ai') return; setActiveClip(0); setMsgObj({key:'pickA', params:{val:factors[0]}}); }}>A</div>
            <div className={`paperclip clip-b ${activeClip === 1 ? 'active' : ''}`} style={{ display: factors[1] ? 'flex' : 'none', left: `calc(${(factors[1] - 1) * 11.11}% + 2%)` }} onClick={(e) => { e.stopPropagation(); if (turnCount < 2 || playerTypes[currentPlayer] === 'ai') return; setActiveClip(1); setMsgObj({key:'pickB', params:{val:factors[1]}}); }}>B</div>
        </div>
      </div>
    </div>
  );
}