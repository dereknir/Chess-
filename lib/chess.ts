import { Chess } from 'chess.js';

export const STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type Outcome =
  | { status: 'ongoing' }
  | { status: 'checkmate'; result: '1-0' | '0-1'; winnerColor: 'w' | 'b' }
  | { status: 'stalemate'; result: '1/2-1/2' }
  | { status: 'draw'; result: '1/2-1/2'; reason: string };

export type AppliedMove = {
  san: string;
  uci: string;
  fenAfter: string;
  turnAfter: 'w' | 'b';
  isCheck: boolean;
  isCapture: boolean;
  outcome: Outcome;
};

/**
 * 套用一步棋並回報結果。
 *
 * 所有規則判定都交給 chess.js —— 吃過路兵、入堡的四個條件、升變、
 * 三次重複、50 步規則、逼和，全部自己刻一定會漏掉某個邊界情況。
 *
 * 走法不合法就丟例外，呼叫端負責轉成使用者看得懂的訊息。
 */
export function applyMove(
  fen: string,
  from: string,
  to: string,
  promotion?: 'q' | 'r' | 'b' | 'n',
): AppliedMove {
  const game = new Chess(fen);

  // chess.js 走法不合法會 throw，這裡讓它往上傳。
  const move = game.move({ from, to, promotion: promotion ?? 'q' });

  return {
    san: move.san,
    uci: move.from + move.to + (move.promotion ?? ''),
    fenAfter: game.fen(),
    turnAfter: game.turn(),
    isCheck: game.inCheck(),
    // 不能用 move.isCapture() —— 它只認 flag 'c'，吃過路兵的 flag 是 'e'，
    // 會被判成沒吃子。改看 captured 欄位，兩種情況都有值。
    isCapture: move.captured !== undefined,
    outcome: readOutcome(game),
  };
}

function readOutcome(game: Chess): Outcome {
  if (game.isCheckmate()) {
    // 輪到誰走就是誰被將死。
    const loser = game.turn();
    return {
      status: 'checkmate',
      result: loser === 'w' ? '0-1' : '1-0',
      winnerColor: loser === 'w' ? 'b' : 'w',
    };
  }
  if (game.isStalemate()) {
    return { status: 'stalemate', result: '1/2-1/2' };
  }
  if (game.isInsufficientMaterial()) {
    return { status: 'draw', result: '1/2-1/2', reason: '子力不足以將死' };
  }
  if (game.isThreefoldRepetition()) {
    return { status: 'draw', result: '1/2-1/2', reason: '三次重複局面' };
  }
  if (game.isDraw()) {
    return { status: 'draw', result: '1/2-1/2', reason: '50 步規則' };
  }
  return { status: 'ongoing' };
}

/** 給棋盤編輯器用：檢查手動擺出來的殘局是不是合法局面。 */
export function isPlayableFen(fen: string): { ok: true } | { ok: false; why: string } {
  try {
    const game = new Chess(fen);
    if (game.isGameOver()) {
      return { ok: false, why: '這個局面已經結束了，開不了局。' };
    }
    if (game.moves().length === 0) {
      return { ok: false, why: '輪到走的一方沒有任何合法棋步。' };
    }
    return { ok: true };
  } catch {
    return { ok: false, why: 'FEN 格式不正確。' };
  }
}

/**
 * 組出可以直接餵給 Lichess Import 的 PGN。
 *
 * 殘局起始一定要帶 SetUp 和 FEN 兩個 tag，否則別的工具會當成標準開局來讀。
 */
export function buildPgn(opts: {
  white: string;
  black: string;
  date: Date;
  result: string;
  initialFen: string;
  sans: string[];
}): string {
  const d = opts.date;
  const dateTag = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

  const tags = [
    `[Event "自食棋力"]`,
    `[Site "-"]`,
    `[Date "${dateTag}"]`,
    `[White "${opts.white}"]`,
    `[Black "${opts.black}"]`,
    `[Result "${opts.result}"]`,
  ];

  if (opts.initialFen !== STARTING_FEN) {
    tags.push(`[SetUp "1"]`, `[FEN "${opts.initialFen}"]`);
  }

  // 殘局起始時，第一手的回合數要從 FEN 裡讀，不能從 1 開始數。
  const startFullmove = Number(opts.initialFen.split(' ')[5] ?? 1);
  const startsWithBlack = opts.initialFen.split(' ')[1] === 'b';

  const parts: string[] = [];
  opts.sans.forEach((san, i) => {
    const isWhiteMove = startsWithBlack ? i % 2 === 1 : i % 2 === 0;
    const fullmove =
      startFullmove + Math.floor((i + (startsWithBlack ? 1 : 0)) / 2);

    if (isWhiteMove) {
      parts.push(`${fullmove}.`);
    } else if (i === 0) {
      parts.push(`${fullmove}...`);
    }
    parts.push(san);
  });

  return `${tags.join('\n')}\n\n${parts.join(' ')} ${opts.result}\n`;
}
