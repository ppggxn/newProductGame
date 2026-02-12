// testGame.js
import GameEngine from './gameLogic.js';

console.log("=== Starting New Product Game Simulation ===");

const game = new GameEngine();
game.printBoard(); // 打印初始空盘

// 模拟动作序列
// 格式: [factorIndex (0=A, 1=B), targetValue]

const moves = [
    // 开局
    [0, 3], // P1 将 A 移到 3 (State: A=3, B=1, Prod=3). Turn 0 -> 1. (通常Turn 0不占地)
    [1, 4], // P2 将 B 移到 4 (State: A=3, B=4, Prod=12). Turn 1 -> 2. (P2占领12)

    // 中盘对弈
    [0, 5], // P1 将 A 移到 5 (State: A=5, B=4, Prod=20). P1占领20
    [1, 6], // P2 将 B 移到 6 (State: A=5, B=6, Prod=30). P2占领30

    // P1 试图连线
    [0, 2], // P1 将 A 移到 2 (State: A=2, B=6, Prod=12). 哎呀，12已经被P2占了！
            // 注意：上面的 gameLogic step 会返回 false，因为12被占了
];

for (let i = 0; i < moves.length; i++) {
    const [fIdx, val] = moves[i];
    const player = game.activePlayer;

    console.log(`\n--- Move ${i + 1} (${player}) ---`);
    console.log(`Attempting to move Factor ${fIdx === 0 ? 'A' : 'B'} to ${val}...`);

    const result = game.step(fIdx, val);

    if (result.success) {
        console.log("Move Successful.");
        game.printBoard();
        if (result.winner) {
            console.log("Game Ended!");
            break;
        }
    } else {
        console.error("Move Failed:", result.message);
        // 如果失败，通常应该重试，这里演示脚本直接继续
    }
}