'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import sql, { type Game } from '@/lib/db';
import { requirePlayer } from '@/lib/auth';
import { applyMove, isPlayableFen, STARTING_FEN } from '@/lib/chess';
import { notifyMove } from '@/lib/discord';

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

      const o = applied.outcome;
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

// ---------- helpers ----------

class UserError extends Error {}

function endingCopy(
  o: ReturnType<typeof applyMove>['outcome'],
  moverName: string,
) {
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
