import LanguageIcon from './assets/LanguageIcon.svg';
import './App.css';
import { useState, useEffect, useMemo } from 'react';
import { getAIMove } from './ai';
import { translations } from './i18n';
import { GRID_SIZE, WIN_COUNT as DEFAULT_WIN_COUNT, FACTOR_RANGE, THINKING_TIME } from './constants';

// 模态框组件
const SettingsModal = ({ isOpen, onClose, winCount, setWinCount, difficulty, setDifficulty, lang, setLang, onReset, thinkingTime, setThinkingTime }) => {
  if (!isOpen) return null;
  const stats = JSON.parse(localStorage.getItem('npg_stats') ||
  '{"p1Wins":0, "p2Wins":0, "draws":0, "total":0}');
  // 计算各自胜率
  const p1WinRate = stats.total > 0 ? Math.round((stats.p1Wins / stats.total) * 100) : 0;
  const p2WinRate = stats.total > 0 ? Math.round((stats.p2Wins / stats.total) * 100) : 0;
  const resetStats = () => {
    localStorage.setItem('npg_stats', JSON.stringify({
      p1Wins: 0,
      p2Wins: 0,
      draws: 0,
      total: 0
    }));
    window.location.reload();
  };

  // 规则改变后，强制重置游戏，避免逻辑冲突
  const handleWinCountChange = (num) => {
    setWinCount(num);
    onReset();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <button className={"language-btn"} onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            <img src={LanguageIcon} alt="🌐"/>
          </button>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {/* 胜利条件设置 */}
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
          <p className="message-box">* {translations[lang].warning}</p>
        </div>

        {/* AI 思考时间，难度*/}
        <div className="modal-section">
          <div className="section-header-row">
            <h3>
              {translations[lang].difficulty}
              <span className="time-control">⚡
                <input type="range" min="0" max="5" step="1"
                  value={thinkingTime / 1000}
                  onChange={(e) => setThinkingTime(Number(e.target.value) * 1000)}/>
                <span className="time-value">{thinkingTime / 1000}s</span>
              </span>
            </h3>
          </div>
          <div className="segmented-control">
            {['random', 'greedy', 'smartGreedy', 'minmax'].map(mode => (
              <button
                key={mode}
                className={`segment-btn ${difficulty === mode ? 'active' : ''}`}
                onClick={() => setDifficulty(mode)}
                title={mode}>
                {mode === 'random' ? translations[lang].difficultyEasy :
                 mode === 'greedy' ? translations[lang].difficultyNormal :
                 mode === 'smartGreedy' ? translations[lang].difficultyMedium : translations[lang].difficultyHard}
              </button>
            ))}
          </div>
        </div>
        {/* 统计面板 */}
        <div className="modal-section">
          <div className="stats-header">
            <h3>{translations[lang].stats}</h3>
            {/* 重置按钮 */}
            <button
              className="settings-btn"
              onClick={resetStats}>↻</button>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{stats.p1Wins}</span>
              <span className="stat-label">P1 {translations[lang].wins}</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.p2Wins}</span>
              <span className="stat-label">P2 {translations[lang].wins}</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.draws}</span>
              <span className="stat-label">{translations[lang].draws}</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">{translations[lang].totalGames}</span>
            </div>
          </div>

            {/* 胜率条形图 */}
          <div className="win-rate-container">
            <div className="win-rate-header">
              <span className="win-rate">{translations[lang].p1}: {p1WinRate}%</span>
              <span className="win-rate">{translations[lang].p2}: {p1WinRate}%</span>
            </div>
            <div className="win-rate-bar-container">
              <div className="win-rate-bar-inner">
                <div
                  className="win-rate-bar-p1"
                  style={{ width: `${p1WinRate}%` }}
                />
                <div
                  className="win-rate-bar-p2"
                  style={{ width: `${p1WinRate}%` }}
                />
              </div>
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
  // UI State
  const [showSettings, setShowSettings] = useState(false);
  // settingWinCount 现在是游戏的实际规则来源
  // 使用 DEFAULT_WIN_COUNT 作为初始值
  const [settingWinCount, setSettingWinCount] = useState(DEFAULT_WIN_COUNT);
  const [aiDifficulty, setAiDifficulty] = useState('random');
  const [thinkingTime, setThinkingTime] = useState(THINKING_TIME);

  // 生成高频查找映射表Value-to-Index Map (O(1) 查找)
  // 仅在 board 数组引用变化（即重新开局）时重新计算
  const valueToIndexMap = useMemo(() => {
    const map = {};
    board.forEach((cell, idx) => {
      map[cell.value] = idx;
    });
    return map;
  }, [board]);

  // msg 现在存对象
  const [msgObj, setMsgObj] = useState({ key: 'startMsg' });

  const t = translations[lang];

  // 解析消息的工具函数
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
    const timer = setTimeout(() => performAIMove(), thinkingTime);
    return () => clearTimeout(timer);
  }, [currentPlayer, playerTypes, winner, board, factors, turnCount, valueToIndexMap, settingWinCount, thinkingTime]);

  // 提取通用的状态重置逻辑
  const resetGameStatus = () => {
    setFactors([null, null]);
    setTurnCount(0);
    setActiveClip(null);
    setCurrentPlayer('p1');
    setWinner(null);
    setWinningLine([]);
    setMsgObj({ key: 'startMsg' });
  };

  // 硬重置：点击标题时（生成全新随机棋盘）
  const startNewGame = () => {
    setBoard(generateInitialBoard()); // 生成全新的数字布局
    resetGameStatus();
  };

  // 软重置：修改规则时（保留数字布局，仅清空颜色）
  const restartCurrentGame = () => {
    // 使用 map 复制当前棋盘，但将 owner 重置为 null
    setBoard(prevBoard => prevBoard.map(cell => ({...cell, owner: null})));
    resetGameStatus();
  };

  const performAIMove = () => {
    // 传入映射表
    const move = getAIMove(board, factors, turnCount, valueToIndexMap, settingWinCount, aiDifficulty);
    if (!move) {
      setMsgObj({ key: 'aiSurrender' });
      // 更新统计数据
      const stats = JSON.parse(localStorage.getItem('npg_stats') || '{"p1Wins":0, "p2Wins":0, "draws":0, "total":0}');
      turnCount % 2 === 0 ? stats.p2Wins++ : stats.p1Wins++;
      stats.total++;
      localStorage.setItem('npg_stats', JSON.stringify(stats));
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
    // 在 attemptMove 函数中，当检测到胜利时：
    if (winLine) {
      setWinner(playerWhoMoved);
      setWinningLine(winLine);
      setMsgObj({ key: 'win', params: { player: t[playerWhoMoved] } });

      // 更新统计数据
      const stats = JSON.parse(localStorage.getItem('npg_stats') ||
        '{"p1Wins":0, "p2Wins":0, "draws":0, "total":0}');

      if (playerWhoMoved === 'p1') {
        stats.p1Wins++;
      } else if (playerWhoMoved === 'p2') {
        stats.p2Wins++;
      }
      stats.total++;

      localStorage.setItem('npg_stats', JSON.stringify(stats));
    } else if (newBoard.every(cell => cell.owner !== null)) {
      setWinner('draw');
      setMsgObj({ key: 'draw' });

      // 平局统计
      const stats = JSON.parse(localStorage.getItem('npg_stats') ||
        '{"p1Wins":0, "p2Wins":0, "draws":0, "total":0}');
      stats.draws++;
      stats.total++;
      localStorage.setItem('npg_stats', JSON.stringify(stats));
    } else {
      const next = playerWhoMoved === 'p1' ? 'p2' : 'p1';
      setCurrentPlayer(next);
      const nextType = playerTypes[next];
      setMsgObj({
        key: nextType === 'ai' ? 'aiThinkingMsg' : 'humanTurnMsg',
        params: { player: t[next] }
      });
      setTurnCount(turnCount + 1);
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
        thinkingTime={thinkingTime}
        setThinkingTime={setThinkingTime}
        lang={lang}
        setLang={setLang}
        onReset={restartCurrentGame} // 使用软重置，清空颜色但保留数字
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
              ⚙
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
            {t.currentProduct}&nbsp;:&nbsp;
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
            {/* 滑块 A/B 保持不变 */}
            <div className={`paperclip clip-a ${activeClip === 0 ? 'active' : ''}`} style={{ display: factors[0] ? 'flex' : 'none', left: `calc(${(factors[0] - 1) * 11.11}% + 2%)` }} onClick={(e) => { e.stopPropagation(); if (turnCount < 2 || playerTypes[currentPlayer] === 'ai') return; setActiveClip(0); setMsgObj({key:'pickA', params:{val:factors[0]}}); }}>A</div>
            <div className={`paperclip clip-b ${activeClip === 1 ? 'active' : ''}`} style={{ display: factors[1] ? 'flex' : 'none', left: `calc(${(factors[1] - 1) * 11.11}% + 2%)` }} onClick={(e) => { e.stopPropagation(); if (turnCount < 2 || playerTypes[currentPlayer] === 'ai') return; setActiveClip(1); setMsgObj({key:'pickB', params:{val:factors[1]}}); }}>B</div>
        </div>
      </div>
    </div>
  );
}