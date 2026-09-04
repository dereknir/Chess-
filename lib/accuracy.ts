import type { MoveAnalysis, Move } from './db';

/**
 * 將 CP 值轉換為勝率（0-100）
 * 使用 Lichess 公式
 */
export function cpToWinPercent(cp: number): number {
  // 對齊 scalachess：先把 cp 夾在 ±CEILING(1000) 再做 sigmoid
  const CEILING = 1000;
  const ceiled = cp > CEILING ? CEILING : cp < -CEILING ? -CEILING : cp;
  const wc = 2 / (1 + Math.exp(-0.00368208 * ceiled)) - 1;
  const clamped = Math.max(-1, Math.min(1, wc));
  return 50 + 50 * clamped;
}

/**
 * 計算單步準確率
 *
 * @param evalBefore 步前評估（Win%）
 * @param evalAfter 步後評估（Win%）
 * @returns 0-100 的準確率
 */
export function calculateMoveAccuracy(evalBefore: number, evalAfter: number): number {
  // 局面變好或持平 = 100% 準確
  if (evalAfter >= evalBefore) {
    return 100;
  }

  // Lichess 公式
  const winDiff = evalBefore - evalAfter;
  const raw = 103.167 * Math.exp(-0.0435 * winDiff) - 3.167;

  // +1 是「不確定性加分」，然後限制在 0-100
  return Math.max(0, Math.min(100, raw + 1));
}

/**
 * 計算調和平均數（Harmonic Mean）
 */
export function harmonicMean(values: number[]): number {
  if (values.length === 0) return 0;

  const sum = values.reduce((s, v) => s + 1 / v, 0);
  return values.length / sum;
}

/**
 * 算術平均數
 */
function arithmeticMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * 標準差（母體）
 */
function stdev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = arithmeticMean(values);
  return Math.sqrt(arithmeticMean(values.map(v => (v - m) ** 2)));
}

/**
 * Lichess AccuracyPercent 全局準確率
 *
 * 對齊 lila 的 AccuracyPercent.fromEvalsAndPov：
 *   最終 = mean(volatility-weighted mean, harmonic mean)
 *
 * @param winPercentsPov 該玩家「每次輪到自己走之前」的局面 Win%（從自己視角），含起始局面
 * @param accuracies     該玩家每步的單步準確率（與 winPercentsPov 對齊，長度 = winPercentsPov.length - 1 或相同皆可）
 */
export function lichessGameAccuracy(
  winPercentsPov: number[],
  accuracies: number[]
): number {
  if (accuracies.length === 0) return 0;

  // 滑動視窗大小：clamp(len/10, 2, 8)
  const windowSize = Math.max(2, Math.min(8, Math.floor(winPercentsPov.length / 10)));

  // 每一步以其局面為中心取視窗，用視窗內 Win% 的標準差當作「波動權重」
  const weights: number[] = [];
  for (let i = 0; i < accuracies.length; i++) {
    const start = Math.max(0, Math.min(i, winPercentsPov.length - windowSize));
    const win = winPercentsPov.slice(start, start + windowSize);
    let w = win.length > 1 ? stdev(win) : 0.5;
    w = Math.max(0.5, Math.min(12, w)); // clamp 到 [0.5, 12]
    weights.push(w);
  }

  const weightedSum = accuracies.reduce((s, a, i) => s + a * weights[i], 0);
  const weightTotal = weights.reduce((s, w) => s + w, 0);
  const weightedMean = weightTotal > 0 ? weightedSum / weightTotal : arithmeticMean(accuracies);

  const harm = harmonicMean(accuracies);

  return (weightedMean + harm) / 2;
}

/**
 * 將 FEN 的盤面欄位展開成 8x8 的棋子陣列（rank 8 -> rank 1）
 * board[r][f]：r=0 是第8列(黑方底線)，r=7 是第1列(白方底線)；f=0 是 a 檔
 * 回傳字元代表棋子（大寫白、小寫黑），空格為 null
 */
function fenToBoard(fen: string): (string | null)[][] {
  const rows = fen.split(' ')[0].split('/');
  const board: (string | null)[][] = [];
  for (const row of rows) {
    const line: (string | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < parseInt(ch, 10); i++) line.push(null);
      } else {
        line.push(ch);
      }
    }
    board.push(line);
  }
  return board;
}

/**
 * scalachess Divider 的區域評分（逐字對齊 Divider.scala 的 score）
 * @param y      區塊列（1..7，1 代表最靠近白方底線 rank1 的那一排區塊）
 * @param white  區塊內白子數（0..4）
 * @param black  區塊內黑子數（0..4）
 */
function scoreRegion(y: number, white: number, black: number): number {
  switch (white) {
    case 0:
      switch (black) {
        case 1: return 1 + y;
        case 2: return y < 6 ? 2 + (6 - y) : 0;
        case 3: return y < 7 ? 3 + (7 - y) : 0;
        case 4: return y < 7 ? 3 + (7 - y) : 0;
        default: return 0;
      }
    case 1:
      switch (black) {
        case 0: return 1 + (8 - y);
        case 1: return 5 + Math.abs(4 - y);
        case 2: return 4 + (7 - y);
        case 3: return 5 + (7 - y);
        default: return 0;
      }
    case 2:
      switch (black) {
        case 0: return y > 2 ? 2 + (y - 2) : 0;
        case 1: return 4 + (y - 1);
        case 2: return 7;
        default: return 0;
      }
    case 3:
      switch (black) {
        case 0: return y > 1 ? 3 + (y - 1) : 0;
        case 1: return 5 + (y - 1);
        default: return 0;
      }
    case 4:
      switch (black) {
        case 0: return y > 1 ? 3 + (y - 1) : 0;
        default: return 0;
      }
    default:
      return 0;
  }
}

/**
 * scalachess Divider.mixedness：掃 7x7=49 個重疊的 2x2 區塊累加分數
 *
 * scalachess 用 bitboard，bit 0 = a1（rank1）。區塊索引 i：
 *   xr = i % 7, yr = i / 7，y = yr + 1（1..7）
 *   區塊涵蓋 rank (yr+1)、(yr+2)。
 * 這裡 board[0]=rank8、board[7]=rank1，需換算。
 * 注意：所有區塊都計分（空區塊得 0），不做 >0 過濾。
 */
function mixedness(board: (string | null)[][]): number {
  let mix = 0;
  for (let yr = 0; yr <= 6; yr++) {
    const y = yr + 1; // 1..7
    for (let xr = 0; xr <= 6; xr++) {
      let whitePieces = 0;
      let blackPieces = 0;
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const rank = y + dy;        // 1..8
          const file = xr + dx + 1;   // 1..8
          const r = 8 - rank;         // rank1 -> board[7]
          const f = file - 1;
          const piece = board[r]?.[f];
          if (piece) {
            if (piece === piece.toUpperCase()) whitePieces++;
            else blackPieces++;
          }
        }
      }
      mix += scoreRegion(y, whitePieces, blackPieces);
    }
  }
  return mix;
}

/**
 * 判斷某盤面「backrank 是否稀疏」（scalachess：底線大子/小子很少）
 */
function backrankSparse(board: (string | null)[][]): boolean {
  // 白底線 = rank1 = board[7]，黑底線 = rank8 = board[0]
  const countMajorsMinors = (rowPieces: (string | null)[]) =>
    rowPieces.filter(p => p && /[qrbnQRBN]/.test(p)).length;
  const whiteBack = countMajorsMinors(board[7] || []);
  const blackBack = countMajorsMinors(board[0] || []);
  return whiteBack < 4 || blackBack < 4;
}

/**
 * 全盤大子小子總數（排除 K/P）
 */
function majorsAndMinors(board: (string | null)[][]): number {
  let n = 0;
  for (const row of board) {
    for (const p of row) {
      if (p && /[qrbnQRBN]/.test(p)) n++;
    }
  }
  return n;
}

/**
 * 對齊 scalachess chess.Divider：一次掃描整盤 FEN 序列，求出
 * midGame 與 endGame 兩個切點（以序列索引表示）。
 *
 *  - midGame = 第一個滿足下列任一條件的局面索引：
 *        majorsAndMinors <= 10 或 backrankSparse 或 mixedness > 150
 *  - endGame = midGame 之後，第一個 majorsAndMinors <= 6 的局面索引
 *
 * @param fens 依序排列的局面 FEN（含起始局面）
 * @returns { midGame, endGame }，找不到則為 undefined
 */
export function dividePhases(fens: string[]): {
  midGame: number | undefined;
  endGame: number | undefined;
} {
  let midGame: number | undefined;
  let endGame: number | undefined;

  for (let i = 0; i < fens.length; i++) {
    const board = fenToBoard(fens[i]);
    const mm = majorsAndMinors(board);

    if (midGame === undefined) {
      if (mm <= 10 || backrankSparse(board) || mixedness(board) > 150) {
        midGame = i;
      }
    }
    if (midGame !== undefined && endGame === undefined && i >= midGame) {
      if (mm <= 6) {
        endGame = i;
      }
    }
  }

  return { midGame, endGame };
}

/**
 * 依切點與局面索引，判斷該局面屬於哪個階段
 */
export function phaseAtIndex(
  index: number,
  bounds: { midGame: number | undefined; endGame: number | undefined }
): 'opening' | 'middlegame' | 'endgame' {
  const { midGame, endGame } = bounds;
  if (endGame !== undefined && index >= endGame) return 'endgame';
  if (midGame !== undefined && index >= midGame) return 'middlegame';
  return 'opening';
}

/**
 * 計算棋局準確率統計（使用 Lichess 公式）
 */
export function calculateGameAccuracy(
  moves: Move[],
  analysis: MoveAnalysis[],
  playerColor: 'white' | 'black'
) {
  // 建立 ply -> move 的映射
  const moveMap = new Map<number, Move>();
  moves.forEach(m => moveMap.set(m.ply, m));

  // 依 ply 排序，建立整盤 FEN 序列（每一步走完後的局面），一次算出階段切點
  const sortedMoves = [...moves].sort((a, b) => a.ply - b.ply);
  const fenSequence = sortedMoves.map(m => m.fen_after);
  const bounds = dividePhases(fenSequence);
  // ply -> 在 fenSequence 中的索引，供 phaseAtIndex 使用
  const plyToIndex = new Map<number, number>();
  sortedMoves.forEach((m, idx) => plyToIndex.set(m.ply, idx));

  // 收集該玩家的所有走法準確率
  const accuracies: number[] = [];
  // 該玩家「每次輪到自己走之前」的局面 Win%（自己視角），供波動加權用
  const winPercentsPov: number[] = [];
  const phaseAccuracies = {
    opening: [] as number[],
    middlegame: [] as number[],
    endgame: [] as number[],
  };
  const phaseWinPercents = {
    opening: [] as number[],
    middlegame: [] as number[],
    endgame: [] as number[],
  };

  // 統計每步評價（只統計該玩家的）
  let bests = 0;
  let goods = 0;
  let inaccuracies = 0;
  let mistakes = 0;
  let blunders = 0;

  for (const a of analysis) {
    const move = moveMap.get(a.ply);
    if (!move) continue;

    // fen_after 的第二欄是「走完之後輪到誰」，也就是對手的顏色
    const turnAfterMove = move.fen_after.split(' ')[1];
    const whoMovedColor = turnAfterMove === 'w' ? 'black' : 'white';

    if (whoMovedColor !== playerColor) continue;

    // 判斷階段（用全局切點 + 該步在序列中的索引）
    const idx = plyToIndex.get(a.ply);
    const phase = idx !== undefined ? phaseAtIndex(idx, bounds) : 'middlegame';

    // 統計每步評價
    if (a.classification === 'best') bests++;
    else if (a.classification === 'good') goods++;
    else if (a.classification === 'inaccuracy') inaccuracies++;
    else if (a.classification === 'mistake') mistakes++;
    else if (a.classification === 'blunder') blunders++;

    // 計算單步準確率（對齊 Lichess：步前局面 vs 步後局面）
    const CEILING = 1000; // Lichess 的 CP 上限

    // 步前評估（從當前輪到走的一方視角，Mate 轉換成 ±1000 cp）
    let evalBefore: number;
    if (a.best_mate_in !== null) {
      const cpEquivalent = a.best_mate_in > 0 ? CEILING : -CEILING;
      evalBefore = cpToWinPercent(cpEquivalent);
    } else if (a.best_cp !== null) {
      evalBefore = cpToWinPercent(a.best_cp);
    } else {
      continue; // 無法評估，跳過
    }

    // 步後評估（從對手視角，需要翻轉，Mate 也轉換成 ±1000 cp）
    let evalAfter: number;
    if (a.mate_in !== null) {
      const cpEquivalent = a.mate_in > 0 ? -CEILING : CEILING;
      evalAfter = cpToWinPercent(cpEquivalent);
    } else if (a.cp !== null) {
      evalAfter = cpToWinPercent(-a.cp); // 翻轉視角
    } else {
      continue; // 無法評估，跳過
    }

    const moveAccuracy = calculateMoveAccuracy(evalBefore, evalAfter);
    accuracies.push(moveAccuracy);
    winPercentsPov.push(evalBefore); // 該步走之前、自己視角的 Win%
    phaseAccuracies[phase].push(moveAccuracy);
    phaseWinPercents[phase].push(evalBefore);
  }

  // 計算整體準確率（Lichess：volatility-weighted mean 與 harmonic mean 的平均）
  const overall = accuracies.length > 0
    ? Math.round(lichessGameAccuracy(winPercentsPov, accuracies))
    : null;

  const opening = phaseAccuracies.opening.length > 0
    ? Math.round(lichessGameAccuracy(phaseWinPercents.opening, phaseAccuracies.opening))
    : null;

  const middlegame = phaseAccuracies.middlegame.length > 0
    ? Math.round(lichessGameAccuracy(phaseWinPercents.middlegame, phaseAccuracies.middlegame))
    : null;

  const endgame = phaseAccuracies.endgame.length > 0
    ? Math.round(lichessGameAccuracy(phaseWinPercents.endgame, phaseAccuracies.endgame))
    : null;

  return {
    overall,
    opening,
    middlegame,
    endgame,
    bests,
    goods,
    inaccuracies,
    mistakes,
    blunders,
  };
}
