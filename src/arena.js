import GameEngine from './game_engine.js';
import { getAIMove } from './ai.js';
import { WIN_COUNT, PLAYER } from './constants.js';

// --- 算法配置映射 ---
const AGENT_CONFIG = {
    'random': 1,
    'greedy': 2,
    'smartGreedy': 3,
    'minmax': 4,
    'nn-minmax': 5
};

function createValueToIndexMap(board) {
    const map = {};
    board.forEach((cell, index) => {
        map[cell.value] = index;
    });
    return map;
}

/**
 * 运行竞技场
 * @param {number} numGames - 总对局数
 * @param {string} agent1Key - 选手1名称
 * @param {string} agent2Key - 选手2名称
 */
async function runArena(numGames = 100, agent1Key = 'nn-minmax', agent2Key = 'smartGreedy') {
    if (!AGENT_CONFIG[agent1Key] || !AGENT_CONFIG[agent2Key]) {
        console.error("❌ Invalid Agent Key");
        return;
    }

    console.log(`\n🏟️  Arena Initialized: ${agent1Key.toUpperCase()} vs ${agent2Key.toUpperCase()}`);
    console.log(`Games: ${numGames} | Win Condition: ${WIN_COUNT} connected`);
    console.log("-".repeat(60));

    const game = new GameEngine(WIN_COUNT);

    // 统计维度1：按模型名称统计
    const modelStats = {
        [agent1Key]: { wins: 0, firstPlayerWins: 0, secondPlayerWins: 0 },
        [agent2Key]: { wins: 0, firstPlayerWins: 0, secondPlayerWins: 0 }
    };

    // 统计维度2：按先后手位置统计 (P1 vs P2)
    const positionStats = {
        firstPlayer: 0,  // P1 总胜场
        secondPlayer: 0  // P2 总胜场
    };

    const startTime = Date.now();

    for (let i = 0; i < numGames; i++) {
        game.reset();

        // 轮流交换先后手以保证公平
        // i 为偶数时，agent1 是 P1；i 为奇数时，agent2 是 P1
        const isAgent1First = (i % 2 === 0);
        const p1Key = isAgent1First ? agent1Key : agent2Key;
        const p2Key = isAgent1First ? agent2Key : agent1Key;

        const p1Difficulty = AGENT_CONFIG[p1Key];
        const p2Difficulty = AGENT_CONFIG[p2Key];

        let stepCount = 0;
        const maxSteps = 100;

        while (!game.winner && stepCount < maxSteps) {
            const valueToIndexMap = createValueToIndexMap(game.board);
            const currentDiff = game.activePlayer === PLAYER.P1 ? p1Difficulty : p2Difficulty;

            const move = getAIMove(
                game.board,
                game.factors,
                game.turnCount,
                valueToIndexMap,
                game.winCount,
                currentDiff
            );

            if (!move) {
                game.winner = (game.activePlayer === PLAYER.P1) ? PLAYER.P2 : PLAYER.P1;
                break;
            }

            const result = game.step(move.clipIndex, move.value);
            if (!result.success) {
                game.winner = (game.activePlayer === PLAYER.P1) ? PLAYER.P2 : PLAYER.P1;
                break;
            }
            stepCount++;
        }

        // --- 记录统计数据 ---
        const winnerPosition = game.winner; // 'p1' 或 'p2'
        const winnerKey = (winnerPosition === PLAYER.P1) ? p1Key : p2Key;

        // 1. 更新位置统计
        if (winnerPosition === PLAYER.P1) {
            positionStats.firstPlayer++;
        } else {
            positionStats.secondPlayer++;
        }

        // 2. 更新模型统计
        modelStats[winnerKey].wins++;
        if (winnerPosition === PLAYER.P1) {
            modelStats[winnerKey].firstPlayerWins++;
        } else {
            modelStats[winnerKey].secondPlayerWins++;
        }

        // 实时进度
        if ((i + 1) % 1 === 0) {
            process.stdout.write(`\rProgress: ${i + 1}/${numGames} | ${agent1Key} Wins: ${modelStats[agent1Key].wins} | ${agent2Key} Wins: ${modelStats[agent2Key].wins}`);
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // --- 打印报告 ---
    console.log("\n\n" + "=".repeat(60));
    console.log(`📊 BATTLE REPORT (Time: ${duration}s)`);
    console.log("=".repeat(60));

    // 模型维度结果
    console.log(`[MODEL PERFORMANCE]`);
    for (const key of [agent1Key, agent2Key]) {
        const stats = modelStats[key];
        const winRate = ((stats.wins / numGames) * 100).toFixed(1);
        console.log(`${key.padEnd(12)}: ${stats.wins} wins (${winRate}%)`);
        console.log(`   └─ As First Player (P1): ${stats.firstPlayerWins} | As Second Player (P2): ${stats.secondPlayerWins}`);
    }

    console.log("-".repeat(60));

    // 先手维度结果
    const p1WinRate = ((positionStats.firstPlayer / numGames) * 100).toFixed(1);
    const p2WinRate = ((positionStats.secondPlayer / numGames) * 100).toFixed(1);
    console.log(`[POSITION ADVANTAGE]`);
    console.log(`First Player (P1) Total Wins  : ${positionStats.firstPlayer} (${p1WinRate}%)`);
    console.log(`Second Player (P2) Total Wins : ${positionStats.secondPlayer} (${p2WinRate}%)`);

    console.log("=".repeat(60));
}

// 示例：运行 50 局对比神经网络和高级贪婪
// 你也可以运行同一模型对比先后手：runArena(50, 'nn-minmax', 'nn-minmax');
runArena(100, 'nn-minmax', 'nn-minmax');