'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import sql, { type Game } from '@/lib/db';
import { requirePlayer } from '@/lib/auth';
import { pusher } from '@/lib/pusher';
import {
  applyMove,
  countRepetitions,
  isPlayableFen,
  STARTING_FEN,
  THREEFOLD_REASON,
  type Outcome,
} from '@/lib/chess';
import { notifyMove } from '@/lib/discord';
import { fetchCloudEvalWithRateLimit } from '@/lib/lichess';
import { Chess } from 'chess.js';

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * 落子。
 *
 * 併發保護有兩層：
 *   1. select ... for update 鎖住該局，兩個請求不會同時改到同一盤
 *   2. expectedPly 比對，擋掉「開著舊分頁按下去」的重複送出
 */
export async function playMove(input: {
  gameId: number;
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
  expectedPly: number;
}): Promise<ActionResult> {
  const me = await requirePlayer();

  let notice: Parameters<typeof notifyMove>[0] | null = null;

  try {
    await sql.begin(async (tx) => {
      const [game] = await tx<Game[]>`
        select * from games where id = ${input.gameId} for update
      `;

      if (!game) throw new UserError('找不到這盤棋。');
      if (game.status !== 'ongoing') throw new UserError('這盤棋已經結束了。');

      const myColor = game.white_id === me.id ? 'w' : 'b';
      if (game.turn !== myColor) throw new UserError('還沒輪到你。');

      if (game.ply_count !== input.expectedPly) {
        throw new UserError('畫面不是最新的，重新整理後再走一次。');
      }

      const applied = applyMove(
        game.current_fen,
        input.from,
        input.to,
        input.promotion,
      );

      const ply = game.ply_count + 1;

      // 思考時間 = 距離上一步（或開局）過了多久
      const [prev] = await tx<{ at: Date }[]>`
        select coalesce(
          (select created_at from moves
            where game_id = ${game.id} order by ply desc limit 1),
          ${game.created_at}
        ) as at
      `;
      const thinkingMs = Date.now() - new Date(prev.at).getTime();

      await tx`
        insert into moves
          (game_id, ply, player_id, san, uci, fen_after,
           is_check, is_capture, thinking_ms)
        values
          (${game.id}, ${ply}, ${me.id}, ${applied.san}, ${applied.uci},
           ${applied.fenAfter}, ${applied.isCheck}, ${applied.isCapture},
           ${thinkingMs})
      `;

      // 三次重複只能在這裡判：chess.js 那邊每步都 new Chess(fen)，實例裡沒有
      // 歷史局面。moves 已經 insert 完，所以下面撈到的資料含這一步。
      let o: Outcome = applied.outcome;
      if (o.status === 'ongoing') {
        const seen = await tx<{ fen_after: string }[]>`
          select fen_after from moves where game_id = ${game.id}
        `;
        const fens = [game.initial_fen, ...seen.map((r) => r.fen_after)];
        if (countRepetitions(fens, applied.fenAfter) >= 3) {
          o = { status: 'draw', result: '1/2-1/2', reason: THREEFOLD_REASON };
        }
      }

      if (o.status === 'ongoing') {
        await tx`
          update games set
            current_fen = ${applied.fenAfter},
            turn        = ${applied.turnAfter},
            ply_count   = ${ply},
            updated_at  = now()
          where id = ${game.id}
        `;
      } else {
        const winnerId =
          o.status === 'checkmate'
            ? o.winnerColor === 'w'
              ? game.white_id
              : game.black_id
            : null;

        await tx`
          update games set
            current_fen = ${applied.fenAfter},
            turn        = ${applied.turnAfter},
            ply_count   = ${ply},
            status      = ${o.status},
            result      = ${o.result},
            winner_id   = ${winnerId},
            updated_at  = now(),
            ended_at    = now()
          where id = ${game.id}
        `;
      }

      const opponentId =
        game.white_id === me.id ? game.black_id : game.white_id;
      const [opponent] = await tx<{ discord_id: string | null }[]>`
        select discord_id from players where id = ${opponentId}
      `;

      notice = {
        opponentDiscordId: opponent?.discord_id ?? null,
        moverName: me.display_name,
        gameId: game.id,
        ply,
        san: applied.san,
        fen: applied.fenAfter,
        uci: applied.uci,
        isCheck: applied.isCheck,
        ending: endingCopy(o, me.display_name),
      };
    });
  } catch (err) {
    if (err instanceof UserError) return { ok: false, message: err.message };
    // chess.js 對不合法走法丟的例外
    if (err instanceof Error && /invalid move/i.test(err.message)) {
      return { ok: false, message: '這步不合法。' };
    }
    console.error('[playMove]', err);
    return { ok: false, message: '落子沒有成功，再試一次。' };
  }

  // 推播放在 response 之後，不拖慢落子的體感。需要 Next.js 15+。
  if (notice) after(() => notifyMove(notice!));

  // Pusher 即時推播：對方頁面立刻刷新
  after(() => {
    pusher.trigger('game-updates', 'move', { gameId: input.gameId }).catch((err) => {
      console.error('[pusher]', err);
    });
  });

  revalidatePath('/');
  return { ok: true };
}

/** 開新局。已經有一盤進行中的話，資料庫的 partial unique index 會擋下來。 */
export async function newGame(input: {
  whiteId: string;
  initialFen?: string;
}): Promise<ActionResult> {
  await requirePlayer();

  const fen = input.initialFen?.trim() || STARTING_FEN;
  const check = isPlayableFen(fen);
  if (!check.ok) return { ok: false, message: check.why };

  const [white] = await sql<{ id: string }[]>`
    select id from players where id = ${input.whiteId}
  `;
  if (!white) return { ok: false, message: '找不到這位玩家。' };

  const [black] = await sql<{ id: string }[]>`
    select id from players where id <> ${input.whiteId} limit 1
  `;

  const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';

  try {
    await sql`
      insert into games
        (white_id, black_id, initial_fen, current_fen, turn)
      values
        (${white.id}, ${black.id}, ${fen}, ${fen}, ${turn})
    `;
  } catch (err) {
    if (err instanceof Error && /only_one_ongoing_game/.test(err.message)) {
      return { ok: false, message: '已經有一盤在進行中，先下完那盤。' };
    }
    throw err;
  }

  revalidatePath('/');
  return { ok: true };
}

export async function resign(gameId: number): Promise<ActionResult> {
  const me = await requirePlayer();

  const [game] = await sql<Game[]>`
    select * from games where id = ${gameId} and status = 'ongoing'
  `;
  if (!game) return { ok: false, message: '這盤棋已經結束了。' };

  const winnerId = game.white_id === me.id ? game.black_id : game.white_id;
  const result = game.white_id === me.id ? '0-1' : '1-0';

  await sql`
    update games set
      status = 'resigned', result = ${result}, winner_id = ${winnerId},
      updated_at = now(), ended_at = now()
    where id = ${gameId}
  `;

  revalidatePath('/');
  return { ok: true };
}

/**
 * 悔棋：刪掉自己剛下的最後一步。
 *
 * 限制：
 * - 每人每局 2 次
 * - 必須是自己剛下完、輪到對方的狀態
 * - 最後一步必須是自己下的
 */
export async function takeback(gameId: number): Promise<ActionResult> {
  const me = await requirePlayer();

  try {
    await sql.begin(async (tx) => {
      const [game] = await tx<Game[]>`
        select * from games where id = ${gameId} for update
      `;

      if (!game) throw new UserError('找不到這盤棋。');
      if (game.status !== 'ongoing') throw new UserError('這盤棋已經結束了。');

      const myColor = game.white_id === me.id ? 'w' : 'b';
      const takebacksLeft =
        myColor === 'w' ? game.white_takebacks_left : game.black_takebacks_left;

      // 檢查 1: 還有沒有次數
      if (takebacksLeft <= 0) {
        throw new UserError('悔棋次數已用完（每人每局限 2 次）。');
      }

      // 檢查 2: 必須「剛下完輪到對方」（turn 是對方）
      if (game.turn === myColor) {
        throw new UserError('還輪到你，不需要悔棋。');
      }

      // 檢查 3: 最後一步是我下的
      const [lastMove] = await tx<{ ply: number; player_id: string }[]>`
        select ply, player_id from moves
        where game_id = ${gameId}
        order by ply desc
        limit 1
      `;

      if (!lastMove) {
        throw new UserError('還沒走過任何一步，無法悔棋。');
      }

      if (lastMove.player_id !== me.id) {
        throw new UserError('最後一步不是你下的，無法悔棋。');
      }

      // 刪掉那步
      await tx`
        delete from moves
        where game_id = ${gameId} and ply = ${lastMove.ply}
      `;

      // 倒回 FEN（從前一步的 fen_after 撈，沒有就用 initial_fen）
      const [prevMove] = await tx<{ fen_after: string }[]>`
        select fen_after from moves
        where game_id = ${gameId}
        order by ply desc
        limit 1
      `;

      const rewindFen = prevMove?.fen_after ?? game.initial_fen;

      // 更新棋局：倒回 FEN、輪到我、減少 ply、扣掉悔棋次數
      if (myColor === 'w') {
        await tx`
          update games set
            current_fen = ${rewindFen},
            turn = 'w',
            ply_count = ${game.ply_count - 1},
            white_takebacks_left = ${game.white_takebacks_left - 1},
            updated_at = now()
          where id = ${gameId}
        `;
      } else {
        await tx`
          update games set
            current_fen = ${rewindFen},
            turn = 'b',
            ply_count = ${game.ply_count - 1},
            black_takebacks_left = ${game.black_takebacks_left - 1},
            updated_at = now()
          where id = ${gameId}
        `;
      }
    });
  } catch (err) {
    if (err instanceof UserError) return { ok: false, message: err.message };
    console.error('[takeback]', err);
    return { ok: false, message: '悔棋失敗，再試一次。' };
  }

  // Pusher 推播：對方頁面立刻刷新
  after(() => {
    pusher.trigger('game-updates', 'move', { gameId }).catch((err) => {
      console.error('[pusher takeback]', err);
    });
  });

  revalidatePath('/');
  return { ok: true };
}

/**
 * 提出和棋。
 *
 * 限制：
 * - 只能在進行中的棋局提和
 * - 對方已經提和時不能重複提和（先回應再說）
 */
export async function offerDraw(gameId: number): Promise<ActionResult> {
  const me = await requirePlayer();

  try {
    await sql.begin(async (tx) => {
      const [game] = await tx<Game[]>`
        select * from games where id = ${gameId} for update
      `;

      if (!game) throw new UserError('找不到這盤棋。');
      if (game.status !== 'ongoing') throw new UserError('這盤棋已經結束了。');

      // 檢查是否已經有待處理的提和
      if (game.pending_draw_offer_by !== null) {
        if (game.pending_draw_offer_by === me.id) {
          throw new UserError('你已經提出和棋了，等對方回應。');
        } else {
          throw new UserError('對方已經提出和棋了，請先回應。');
        }
      }

      await tx`
        update games set
          pending_draw_offer_by = ${me.id},
          updated_at = now()
        where id = ${gameId}
      `;
    });
  } catch (err) {
    if (err instanceof UserError) return { ok: false, message: err.message };
    console.error('[offerDraw]', err);
    return { ok: false, message: '提和失敗，再試一次。' };
  }

  // Pusher 推播：對方頁面立刻顯示提和通知
  after(() => {
    pusher.trigger('game-updates', 'move', { gameId }).catch((err) => {
      console.error('[pusher offerDraw]', err);
    });
  });

  revalidatePath('/');
  return { ok: true };
}

/**
 * 回應提和：接受或拒絕。
 *
 * @param accept - true 接受（和棋），false 拒絕（繼續下）
 */
export async function respondToDraw(
  gameId: number,
  accept: boolean,
): Promise<ActionResult> {
  const me = await requirePlayer();

  try {
    await sql.begin(async (tx) => {
      const [game] = await tx<Game[]>`
        select * from games where id = ${gameId} for update
      `;

      if (!game) throw new UserError('找不到這盤棋。');
      if (game.status !== 'ongoing') throw new UserError('這盤棋已經結束了。');

      if (game.pending_draw_offer_by === null) {
        throw new UserError('目前沒有待處理的提和。');
      }

      if (game.pending_draw_offer_by === me.id) {
        throw new UserError('不能回應自己的提和。');
      }

      if (accept) {
        // 接受和棋
        await tx`
          update games set
            status = 'draw',
            result = '1/2-1/2',
            winner_id = null,
            pending_draw_offer_by = null,
            updated_at = now(),
            ended_at = now()
          where id = ${gameId}
        `;
      } else {
        // 拒絕提和，清空待處理狀態
        await tx`
          update games set
            pending_draw_offer_by = null,
            updated_at = now()
          where id = ${gameId}
        `;
      }
    });
  } catch (err) {
    if (err instanceof UserError) return { ok: false, message: err.message };
    console.error('[respondToDraw]', err);
    return { ok: false, message: '回應提和失敗，再試一次。' };
  }

  // Pusher 推播
  after(() => {
    pusher.trigger('game-updates', 'move', { gameId }).catch((err) => {
      console.error('[pusher respondToDraw]', err);
    });
  });

  revalidatePath('/');
  return { ok: true };
}

/**
 * 更新棋局備註。
 */
export async function updateGameNote(
  gameId: number,
  note: string,
): Promise<ActionResult> {
  await requirePlayer();

  const trimmedNote = note.trim();

  try {
    await sql`
      update games set
        note = ${trimmedNote || null},
        updated_at = now()
      where id = ${gameId}
    `;
  } catch (err) {
    console.error('[updateGameNote]', err);
    return { ok: false, message: '更新備註失敗，再試一次。' };
  }

  revalidatePath('/game/[id]');
  revalidatePath('/history');
  return { ok: true };
}

/**
 * 更新棋盤主題偏好。
 */
export async function updateBoardTheme(
  themeId: string,
): Promise<ActionResult> {
  const me = await requirePlayer();

  try {
    await sql`
      update players set board_theme = ${themeId} where id = ${me.id}
    `;
  } catch (err) {
    console.error('[updateBoardTheme]', err);
    return { ok: false, message: '更新主題失敗，再試一次。' };
  }

  // 主題是在 layout 讀的（currentPlayer），所以整層都要 revalidate。
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * 發送聊天訊息。
 */
export async function sendChatMessage(
  gameId: number,
  message: string,
): Promise<ActionResult> {
  const me = await requirePlayer();

  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return { ok: false, message: '訊息不能空白。' };
  }

  if (trimmedMessage.length > 500) {
    return { ok: false, message: '訊息太長（最多 500 字）。' };
  }

  try {
    // 取得當前手數
    const [game] = await sql<Game[]>`
      select ply_count from games where id = ${gameId}
    `;

    await sql`
      insert into chat_messages (game_id, player_id, message, ply)
      values (${gameId}, ${me.id}, ${trimmedMessage}, ${game?.ply_count ?? null})
    `;
  } catch (err) {
    console.error('[sendChatMessage]', err);
    return { ok: false, message: '發送訊息失敗，再試一次。' };
  }

  // Pusher 推播：對方立刻看到新訊息
  after(() => {
    pusher.trigger('game-updates', 'chat', { gameId }).catch((err) => {
      console.error('[pusher sendChatMessage]', err);
    });
  });

  revalidatePath('/');
  revalidatePath('/game/[id]');
  return { ok: true };
}

/**
 * 分析整局棋譜，查詢 Lichess Cloud Eval 並儲存分析結果。
 * 僅在對局結束後執行。
 */
export async function analyzeGame(gameId: number): Promise<ActionResult> {
  const me = await requirePlayer();

  try {
    // 檢查對局是否存在且已結束
    const [game] = await sql<Game[]>`
      select * from games where id = ${gameId}
    `;

    if (!game) {
      return { ok: false, message: '找不到這盤棋。' };
    }

    if (game.status === 'ongoing') {
      return { ok: false, message: '對局尚未結束，無法分析。' };
    }

    // 檢查是否已經分析過
    const existingAnalysis = await sql`
      select count(*) as count from move_analysis where game_id = ${gameId}
    `;

    if (Number(existingAnalysis[0].count) > 0) {
      console.log(`[analyzeGame] Game ${gameId} already analyzed, skipping`);
      return { ok: true };
    }

    // 取得所有步數
    const moves = await sql`
      select * from moves where game_id = ${gameId} order by ply
    `;

    console.log(`[analyzeGame] Analyzing ${moves.length} moves for game ${gameId}`);

    // 逐步分析每一個局面
    let previousCp: number | null = 0; // 開局評分視為 0

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      const fenBefore = i === 0 ? game.initial_fen : moves[i - 1].fen_after;
      const fenAfter = move.fen_after;

      // 查詢該步之前的局面評估
      const evalBefore = await fetchCloudEvalWithRateLimit(fenBefore, 3);

      if (!evalBefore || evalBefore.pvs.length === 0) {
        console.log(`[analyzeGame] No eval for ply ${move.ply}, skipping`);
        continue;
      }

      const bestPv = evalBefore.pvs[0];
      const bestMove = bestPv.moves.split(' ')[0]; // 取第一個走法 (UCI)

      // 查詢該步之後的局面評估（用於計算實際走法的影響）
      const evalAfter = await fetchCloudEvalWithRateLimit(fenAfter, 1);

      const currentCp = evalAfter?.pvs[0]?.cp ?? null;
      const currentMate = evalAfter?.pvs[0]?.mate ?? null;

      // 判斷實際走法在建議中排第幾
      const actualMoveRank = findMoveRank(evalBefore, move.uci);

      // 分類這一步的品質
      const classification = classifyMove(
        previousCp,
        currentCp,
        bestPv.cp ?? null,
        move.ply
      );

      // 將最佳走法轉換成 SAN
      const bestMoveSan = uciToSan(fenBefore, bestMove);

      // 儲存分析結果
      await sql`
        insert into move_analysis (
          game_id, ply, cp, mate_in, best_move, best_move_san,
          actual_move_rank, depth, classification
        ) values (
          ${gameId}, ${move.ply}, ${currentCp}, ${currentMate},
          ${bestMove}, ${bestMoveSan}, ${actualMoveRank},
          ${evalBefore.depth}, ${classification}
        )
      `;

      previousCp = currentCp;
    }

    console.log(`[analyzeGame] Analysis complete for game ${gameId}`);
    revalidatePath('/game/[id]');
    return { ok: true };
  } catch (err) {
    console.error('[analyzeGame]', err);
    return { ok: false, message: '分析失敗：' + String(err) };
  }
}

// ---------- helpers ----------

class UserError extends Error {}

/**
 * 找出實際走法在建議清單中排第幾
 */
function findMoveRank(
  evaluation: { pvs: Array<{ moves: string }> },
  actualUci: string
): number | null {
  for (let i = 0; i < evaluation.pvs.length; i++) {
    const suggestedMove = evaluation.pvs[i].moves.split(' ')[0];
    if (suggestedMove === actualUci) {
      return i + 1; // 1-indexed
    }
  }
  return null; // 不在建議中
}

/**
 * 分類走法品質
 */
function classifyMove(
  cpBefore: number | null,
  cpAfter: number | null,
  bestCp: number | null,
  ply: number
): 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | null {
  // 如果沒有足夠的資訊，無法分類
  if (cpBefore === null || cpAfter === null || bestCp === null) {
    return null;
  }

  // 開局前幾步容忍度高一點
  const isOpening = ply <= 10;

  // 計算評分變化（從當前行動方的角度）
  // ply 奇數 = 白方走, ply 偶數 = 黑方走
  const isWhiteMove = ply % 2 === 1;

  // 將評分轉換為當前行動方的視角
  const beforeFromMoverPov = isWhiteMove ? cpBefore : -cpBefore;
  const afterFromMoverPov = isWhiteMove ? cpAfter : -cpAfter;
  const bestFromMoverPov = isWhiteMove ? bestCp : -bestCp;

  // 計算損失（走這步之後損失了多少評分）
  const loss = beforeFromMoverPov - afterFromMoverPov;

  // 計算跟最佳走法的差距
  const missedBest = bestFromMoverPov - afterFromMoverPov;

  // 分類標準
  if (missedBest <= 10) return 'best';
  if (missedBest <= 30) return 'good';
  if (missedBest <= 60 || (isOpening && missedBest <= 80)) return 'inaccuracy';
  if (missedBest <= 150) return 'mistake';
  return 'blunder';
}

/**
 * 將 UCI 走法轉換成 SAN 格式
 */
function uciToSan(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] as 'q' | 'r' | 'b' | 'n' | undefined,
    });
    return move ? move.san : null;
  } catch {
    return null;
  }
}

function endingCopy(o: Outcome, moverName: string) {
  switch (o.status) {
    case 'checkmate':
      return { headline: '將死', detail: `${moverName} 獲勝。` };
    case 'stalemate':
      return { headline: '逼和', detail: '無子可動又沒被將軍，和棋。' };
    case 'draw':
      return { headline: '和棋', detail: o.reason };
    default:
      return undefined;
  }
}
