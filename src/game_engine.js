// game_engine.js
import { GRID_SIZE, WIN_COUNT, PLAYER, PRODUCTS } from './constants.js';

class GameEngine {
    constructor(winCount = WIN_COUNT) {
        this.gridSize = GRID_SIZE;
        this.winCount = winCount;
        this.reset();
    }

    // --- 初始化与重置 ---

    reset() {
        this.board = this._generateBoard();
        this.factors = [1, 1]; // [Factor A, Factor B] 初始位置
        this.turnCount = 0;
        this.winner = null;
        this.moveHistory = [];
        this.activePlayer = PLAYER.P1;
    }

    // 生成随机棋盘：将预设的 36 个乘积结果随机打乱填充
    _generateBoard() {
        // 1. 创建 PRODUCTS 的副本并进行洗牌 (Fisher-Yates Shuffle)
        const shuffledProducts = [...PRODUCTS];
        for (let i = shuffledProducts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledProducts[i], shuffledProducts[j]] = [shuffledProducts[j], shuffledProducts[i]];
        }

        // 2. 将洗牌后的数字映射到棋盘格对象中
        const board = shuffledProducts.map((val, i) => ({
            value: val,
            owner: null, // 'p1', 'p2', or null
            index: i
        }));

        return board;
    }

    // --- 核心交互 ---

    /**
     * 执行移动
     * @param {number} factorIndex - 0 代表滑块A, 1 代表滑块B
     * @param {number} newValue - 新的数值 (1-9)
     * @returns {object} result - { success: boolean, message: string }
     */
    step(factorIndex, newValue) {
            if (this.winner) return { success: false, message: "Game Over" };
            if (newValue < 1 || newValue > 9) return { success: false, message: "Invalid value" };

            // 规则：不能原地不动
            if (this.factors[factorIndex] === newValue) {
                return { success: false, message: "Must move to a new number" };
            }

            const newFactors = [...this.factors];
            newFactors[factorIndex] = newValue;
            const product = newFactors[0] * newFactors[1];

            let captured = false;

            // --- 核心规则逻辑 ---

            // 第一步 (Turn 0): 仅放置滑块 A，不占领
            if (this.turnCount === 0) {
                if (factorIndex !== 0) return { success: false, message: "Player 1 must move Factor A first" };
                // 仅更新位置，不执行占领
            } else {
                // 第二步及以后: 必须占领格子
                // 棋盘数字已唯一化，直接查找匹配且未被占领的格子
                const targetCell = this.board.find(c => c.value === product && c.owner === null);

                if (!targetCell) {
                    // 如果找不到空格子，按照规则：该玩家无路可走，判负
                    this.winner = this.activePlayer === PLAYER.P1 ? PLAYER.P2 : PLAYER.P1;
                    return { success: false, message: `No empty cell for product ${product}. Game Over!` };
                }

                targetCell.owner = this.activePlayer;
                captured = true;

                // 检查胜负 (连线数量由 winCount 决定)
                if (this.checkWin(targetCell.index)) {
                    this.winner = this.activePlayer;
                }
            }

            // --- 更新状态 ---
            this.factors = newFactors;
            this.moveHistory.push({
                player: this.activePlayer,
                movedFactor: factorIndex,
                toValue: newValue,
                product: product,
                captured: captured
            });

            this.turnCount++;
            this.activePlayer = this.activePlayer === PLAYER.P1 ? PLAYER.P2 : PLAYER.P1;

            return { success: true, winner: this.winner };
        }

    // --- 胜负判定 ---

    checkWin(lastIndex) {
        const row = Math.floor(lastIndex / this.gridSize);
        const col = lastIndex % this.gridSize;
        const player = this.board[lastIndex].owner;

        // 八方向：横、竖、正斜、反斜
        const directions = [
            [0, 1],  // Horizontal
            [1, 0],  // Vertical
            [1, 1],  // Diagonal \
            [1, -1]  // Diagonal /
        ];

        for (let [dr, dc] of directions) {
            let count = 1; // 包含当前落子

            // 正向搜索
            let r = row + dr;
            let c = col + dc;
            while (this._isValid(r, c) && this._getCell(r, c).owner === player) {
                count++;
                r += dr;
                c += dc;
            }

            // 反向搜索
            r = row - dr;
            c = col - dc;
            while (this._isValid(r, c) && this._getCell(r, c).owner === player) {
                count++;
                r -= dr;
                c -= dc;
            }

            if (count >= this.winCount) return true;
        }
        return false;
    }

    _isValid(r, c) {
        return r >= 0 && r < this.gridSize && c >= 0 && c < this.gridSize;
    }

    _getCell(r, c) {
        return this.board[r * this.gridSize + c];
    }

    // --- 辅助方法 ---

    // 导出当前状态供神经网络使用
    getState() {
        return {
            board: this.board.map(c => c.owner === PLAYER.P1 ? 1 : (c.owner === PLAYER.P2 ? -1 : 0)), // 简化版张量
            factors: this.factors,
            turn: this.turnCount,
            winner: this.winner
        };
    }

    printBoard() {
        console.log(`\nTurn: ${this.turnCount} | Next: ${this.activePlayer} | Factors: [${this.factors}]`);
        for (let r = 0; r < this.gridSize; r++) {
            let rowStr = "";
            for (let c = 0; c < this.gridSize; c++) {
                const cell = this._getCell(r, c);
                const valStr = cell.value.toString().padStart(2, ' ');
                let mark = " ";
                if (cell.owner === PLAYER.P1) mark = "X"; // P1
                if (cell.owner === PLAYER.P2) mark = "Y"; // P2
                rowStr += `[${valStr}${mark}]`;
            }
            console.log(rowStr);
        }
        if (this.winner) console.log(`🎉 WINNER: ${this.winner} 🎉`);
    }
}

export default GameEngine;