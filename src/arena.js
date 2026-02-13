import GameEngine from './game_engine.js';
import { getAIMove } from './ai.js';
import { WIN_COUNT, PLAYER } from './constants.js';

// --- 算法配置映射 ---
// 对应 ai.js 中 getAIMove 的 switch case
const AGENT_CONFIG = {
    'random': 1,      // 纯随机
    'greedy': 2,      // 基础贪婪
    'smartGreedy': 3, // 高级贪婪 (带防守和连珠判断)
    'minmax': 4,      // 传统 MinMax (启发式评分)
    'nn-minmax': 5    // 神经网络 MinMax (Value Net 评分)
};

/**
 * 辅助函数：生成 Value -> Index 的映射
 */
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
 * @param {string} agent1Key - 选手1的算法名称
 * @param {string} agent2Key - 选手2的算法名称
 */
async function runArena(numGames = 100, agent1Key = 'nn-minmax', agent2Key = 'smartGreedy') {
    // 1. 验证配置
    if (!AGENT_CONFIG[agent1Key] || !AGENT_CONFIG[agent2Key]) {
        console.error("❌ Invalid Agent Key. Available keys:", Object.keys(AGENT_CONFIG));
        return;
    }

    console.log(`\n🏟️  Arena Initialized: ${agent1Key.toUpperCase()} vs ${agent2Key.toUpperCase()}`);
    console.log(`Rules: First to ${WIN_COUNT} OR Last to Move Wins (No Draw)`);
    console.log("-".repeat(50));

    const game = new GameEngine(WIN_COUNT);
    const results = {
        [agent1Key]: 0,
        [agent2Key]: 0,
        "Timeout": 0 // 仅用于代码死循环保护，正常不应出现
    };

    const startTime = Date.now();

    for (let i = 0; i < numGames; i++) {
        game.reset();

        // --- 公平性设置：互换先手 ---
        let p1Key, p2Key, p1Difficulty, p2Difficulty;

        if (i < numGames / 2) {
            p1Key = agent1Key;
            p2Key = agent2Key;
        } else {
            p1Key = agent2Key;
            p2Key = agent1Key;
        }

        p1Difficulty = AGENT_CONFIG[p1Key];
        p2Difficulty = AGENT_CONFIG[p2Key];

        let stepCount = 0;
        const maxSteps = 100; // 防止程序死循环的硬限制

        // --- 单局循环 ---
        while (!game.winner && stepCount < maxSteps) {
            const valueToIndexMap = createValueToIndexMap(game.board);
            const currentDifficulty = game.activePlayer === PLAYER.P1 ? p1Difficulty : p2Difficulty;

            // 获取 AI 移动
            const move = getAIMove(
                game.board,
                game.factors,
                game.turnCount,
                valueToIndexMap,
                game.winCount,
                currentDifficulty
            );

            // 核心规则修正：无路可走 = 输
            if (!move) {
                // 当前玩家无法移动，判对手获胜
                game.winner = (game.activePlayer === PLAYER.P1) ? PLAYER.P2 : PLAYER.P1;
                break;
            }

            // 执行移动
            const result = game.step(move.clipIndex, move.value);

            // 引擎层面的双重检查（万一 AI 传了非法步，引擎也会报错或判负）
            if (!result.success) {
                // 如果引擎拒绝了移动（比如该点已被占），视为当前玩家违规/无路可走 -> 判负
                game.winner = (game.activePlayer === PLAYER.P1) ? PLAYER.P2 : PLAYER.P1;
                break;
            }

            stepCount++;
        }

        // --- 记录结果 ---
        let winnerName = "Timeout"; // 默认超时

        if (game.winner) {
            if (game.winner === PLAYER.P1) {
                winnerName = p1Key; // P1 赢了，查看本局 P1 是谁
            } else {
                winnerName = p2Key; // P2 赢了
            }
        }

        results[winnerName]++;

        // 简易进度条
        if ((i + 1) % 1 === 0) {
            const percent = (((i + 1) / numGames) * 100).toFixed(1);
            process.stdout.write(`\rProgress: ${i + 1}/${numGames} (${percent}%) | ${agent1Key}: ${results[agent1Key]} | ${agent2Key}: ${results[agent2Key]}`);
        }
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    const avgTime = (duration / numGames).toFixed(3);

    // --- 最终报告 ---
    console.log("\n\n" + "=".repeat(40));
    console.log("🏆 Final Results 🏆");
    console.log("=".repeat(40));
    console.log(`Total Games : ${numGames}`);
    console.log(`Time Taken  : ${duration}s (Avg: ${avgTime}s/game)`);
    console.log("-".repeat(40));
    console.log(`${agent1Key.padEnd(15)}: ${results[agent1Key]} wins (${(results[agent1Key]/numGames*100).toFixed(1)}%)`);
    console.log(`${agent2Key.padEnd(15)}: ${results[agent2Key]} wins (${(results[agent2Key]/numGames*100).toFixed(1)}%)`);

    if (results["Timeout"] > 0) {
        console.log(`Timeouts      : ${results['Timeout']} (Check maxSteps logic)`);
    }
    console.log("=".repeat(40));

    if (results[agent1Key] > results[agent2Key]) {
        console.log(`Verdict: ${agent1Key} is stronger!`);
    } else if (results[agent2Key] > results[agent1Key]) {
        console.log(`Verdict: ${agent2Key} is stronger!`);
    } else {
        console.log("Verdict: It's a perfect tie!");
    }
}

// const AGENT_CONFIG = {
//     'random': 1,      // 纯随机
//     'greedy': 2,      // 基础贪婪
//     'smartGreedy': 3, // 高级贪婪 (带防守和连珠判断)
//     'minmax': 4,      // 传统 MinMax (启发式评分)
//     'nn-minmax': 5    // 神经网络 MinMax (Value Net 评分)
// };
runArena(100, 'nn-minmax', 'minmax');