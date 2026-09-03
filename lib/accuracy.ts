import type { MoveAnalysis, Move } from './db';

/**
 * 將 CP 值轉換為勝率（0-100）
 * 使用 Lichess 公式
 */
export function cpToWinPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
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
 * 從 FEN 判斷棋局階段（簡化版：用子數）
 */
export function getPhase(fen: string): 'opening' | 'middlegame' | 'endgame' {
  const pieces = fen.split(' ')[0];

  // 計算大子小子（排除 K k P p）
  const majorsMinors = (pieces.match(/[QRBNqrbn]/g) || []).length;

  if (majorsMinors <= 6) return 'endgame';
  if (majorsMinors <= 10) return 'middlegame';
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

  // 收集該玩家的所有走法準確率
  const accuracies: number[] = [];
  const phaseAccuracies = {
    opening: [] as number[],
    middlegame: [] as number[],
    endgame: [] as number[],
  };

  // 統計失誤（只統計該玩家的）
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

    // 判斷階段
    const phase = getPhase(move.fen_after);

    // 統計失誤
    if (a.classification === 'inaccuracy') inaccuracies++;
    else if (a.classification === 'mistake') mistakes++;
    else if (a.classification === 'blunder') blunders++;

    // 計算單步準確率
    if (a.best_cp !== null && a.cp !== null) {
      // 步前評估（最佳走法）
      const evalBefore = cpToWinPercent(a.best_cp);
      // 步後評估（實際走法後）- 需要從對手視角翻轉
      const evalAfter = cpToWinPercent(-a.cp);

      const moveAccuracy = calculateMoveAccuracy(evalBefore, evalAfter);
      accuracies.push(moveAccuracy);
      phaseAccuracies[phase].push(moveAccuracy);
    } else if (a.best_mate_in !== null || a.mate_in !== null) {
      // 將死局面的準確率處理
      const evalBefore = a.best_mate_in !== null
        ? (a.best_mate_in > 0 ? 100 : 0)
        : 50;
      const evalAfter = a.mate_in !== null
        ? (a.mate_in > 0 ? 0 : 100) // 從對手視角翻轉
        : 50;

      const moveAccuracy = calculateMoveAccuracy(evalBefore, evalAfter);
      accuracies.push(moveAccuracy);
      phaseAccuracies[phase].push(moveAccuracy);
    }
  }

  // 計算整體準確率（調和平均）
  const overall = accuracies.length > 0
    ? Math.round(harmonicMean(accuracies))
    : null;

  const opening = phaseAccuracies.opening.length > 0
    ? Math.round(harmonicMean(phaseAccuracies.opening))
    : null;

  const middlegame = phaseAccuracies.middlegame.length > 0
    ? Math.round(harmonicMean(phaseAccuracies.middlegame))
    : null;

  const endgame = phaseAccuracies.endgame.length > 0
    ? Math.round(harmonicMean(phaseAccuracies.endgame))
    : null;

  return {
    overall,
    opening,
    middlegame,
    endgame,
    inaccuracies,
    mistakes,
    blunders,
  };
}
