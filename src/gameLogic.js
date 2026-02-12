// gameLogic.js
import { GRID_SIZE, WIN_COUNT, PLAYER } from './constants.js';

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

    // 生成随机棋盘（简单版：随机填充乘积结果）
    _generateBoard() {
        const board = [];
        for (let i = 0; i < this.gridSize * this.gridSize; i++) {
            // 随机生成 1-9 * 1-9 的结果
            const f1 = Math.floor(Math.random() * 9) + 1;
            const f2 = Math.floor(Math.random() * 9) + 1;
            board.push({
                value: f1 * f2,
                owner: null, // 'p1', 'p2', or null
                index: i
            });
        }
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

        // 规则检查：第一回合P1只能动A(0)，第二回合P2只能动B(1)
        // 之后的逻辑根据具体游戏规则，通常是任选一个移动
        // 这里假设：严格轮流？或者由外部AI决定动哪个。
        // 为了通用性，我们允许移动任意滑块，只要符合游戏基本约束。

        // 模拟原本的逻辑：不能原地不动
        if (this.factors[factorIndex] === newValue) {
            return { success: false, message: "Must move to a new number" };
        }

        const newFactors = [...this.factors];
        newFactors[factorIndex] = newValue;
        const product = newFactors[0] * newFactors[1];

        // 第一步通常不占格子（根据具体规则，有时第一步只是定位置）
        // 这里假设：第0回合(P1)只移动不占，第1回合(P2)开始占领
        let captured = false;

        if (this.turnCount > 0) {
            // 查找棋盘上对应数值的格子
            // 注意：棋盘上可能有多个相同的数字，或者唯一的。
            // 假设逻辑：必须占领该数值的一个空格子。如果没有空格子，则判负或无效？
            // 简化逻辑：找到第一个匹配且空的格子。
            const targetCells = this.board.filter(c => c.value === product && c.owner === null);

            if (targetCells.length === 0) {
                // 检查是否是被对手占了，还是根本没这个数（虽然后者不太可能如果棋盘生成正确）
                return { success: false, message: `Product ${product} not available` };
            }

            // 占领逻辑：这里简单取第一个可用的（如果你的游戏有选择具体格子的逻辑，需要传参 targetCellIndex）
            // 假设棋盘生成时保证了数字唯一性，或者规则是自动占领第一个。
            // 现在的实现：自动占领找到的第一个空位。
            const cellToCapture = targetCells[0];
            cellToCapture.owner = this.activePlayer;
            captured = true;

            // 检查胜负
            if (this.checkWin(cellToCapture.index)) {
                this.winner = this.activePlayer;
            }
        }

        // 更新状态
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
                if (cell.owner === PLAYER.P2) mark = "O"; // P2
                rowStr += `[${valStr}${mark}]`;
            }
            console.log(rowStr);
        }
        if (this.winner) console.log(`🎉 WINNER: ${this.winner} 🎉`);
    }
}

export default GameEngine;