import { NextRequest } from 'next/server';
import sql from '@/lib/db';
import { fetchCloudEvalWithRateLimit } from '@/lib/lichess';
import { uciToSan } from '@/lib/chess';

/**
 * Server-Sent Events API for game analysis with real-time progress
 *
 * Usage: GET /api/analyze/[gameId]
 * Returns: text/event-stream with progress updates
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  // 設定 SSE headers
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let clientConnected = true;

      function send(event: string, data: any) {
        if (!clientConnected) return;
        try {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (e) {
          clientConnected = false;
        }
      }

      try {
        // 檢查遊戲是否存在
        const [game] = await sql`
          select * from games where id = ${gameId}
        `;

        if (!game) {
          send('error', { message: 'Game not found' });
          controller.close();
          return;
        }

        // 檢查分析狀態
        if (game.analysis_status === 'completed') {
          send('complete', { message: 'Already analyzed' });
          controller.close();
          return;
        }

        // 如果已經在分析中，只允許監聽，不重新開始分析
        if (game.analysis_status === 'analyzing') {
          // 這是重新連接的客戶端，只發送當前進度但不執行分析
          const moves = await sql`
            select * from moves where game_id = ${gameId} order by ply
          `;
          const analyzedCount = await sql`
            select count(*) as count from move_analysis where game_id = ${gameId}
          `;

          send('start', { total: moves.length });
          send('progress', {
            current: Number(analyzedCount[0].count),
            total: moves.length,
          });

          // 持續檢查進度直到完成
          const checkInterval = setInterval(async () => {
            if (!clientConnected) {
              clearInterval(checkInterval);
              return;
            }

            const [currentGame] = await sql`
              select analysis_status from games where id = ${gameId}
            `;

            if (currentGame.analysis_status === 'completed') {
              send('complete', { analyzed: moves.length, total: moves.length });
              clearInterval(checkInterval);
              if (clientConnected) controller.close();
            } else if (currentGame.analysis_status === 'failed') {
              send('error', { message: 'Analysis failed' });
              clearInterval(checkInterval);
              if (clientConnected) controller.close();
            } else {
              const currentCount = await sql`
                select count(*) as count from move_analysis where game_id = ${gameId}
              `;
              send('progress', {
                current: Number(currentCount[0].count),
                total: moves.length,
              });
            }
          }, 2000); // 每 2 秒檢查一次進度

          return;
        }

        // 設定狀態為分析中（第一次分析）
        await sql`
          update games set analysis_status = 'analyzing' where id = ${gameId}
        `;

        // 取得所有步數
        const moves = await sql`
          select * from moves where game_id = ${gameId} order by ply
        `;

        const totalMoves = moves.length;
        send('start', { total: totalMoves });

        // 逐步分析
        let previousCp: number | null = 0;
        let analyzedCount = 0;

        for (let i = 0; i < moves.length; i++) {
          const move = moves[i];
          const fenBefore = i === 0 ? game.initial_fen : moves[i - 1].fen_after;
          const fenAfter = move.fen_after;

          // 發送進度更新
          send('progress', {
            current: i + 1,
            total: totalMoves,
            ply: move.ply,
            san: move.san,
          });

          // 查詢該步之前的局面評估
          const evalBefore = await fetchCloudEvalWithRateLimit(fenBefore, 3);

          if (!evalBefore || evalBefore.pvs.length === 0) {
            continue;
          }

          const bestPv = evalBefore.pvs[0];
          const bestMove = bestPv.moves.split(' ')[0];

          // 查詢該步之後的局面評估
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
              game_id, ply, cp, mate_in, depth, best_move, best_move_san,
              actual_move_rank, classification
            ) values (
              ${gameId}, ${move.ply}, ${currentCp}, ${currentMate},
              ${evalBefore.depth}, ${bestMove}, ${bestMoveSan},
              ${actualMoveRank}, ${classification}
            )
          `;

          analyzedCount++;
          previousCp = currentCp;
        }

        // 更新狀態為已完成
        await sql`
          update games set analysis_status = 'completed' where id = ${gameId}
        `;

        send('complete', {
          analyzed: analyzedCount,
          total: totalMoves,
        });

        if (clientConnected) {
          controller.close();
        }
      } catch (error) {
        console.error('[API /analyze] Error:', error);

        // 更新狀態為失敗
        await sql`
          update games set analysis_status = 'failed' where id = ${gameId}
        `;

        send('error', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });

        if (clientConnected) {
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Helper functions (copied from actions.ts)

function findMoveRank(
  evalBefore: any,
  actualMove: string
): number {
  const rank = evalBefore.pvs.findIndex((pv: any) => {
    const firstMove = pv.moves.split(' ')[0];
    return firstMove === actualMove;
  });
  return rank === -1 ? 99 : rank + 1;
}

function classifyMove(
  previousCp: number | null,
  currentCp: number | null,
  bestCp: number | null,
  ply: number
): string | null {
  if (currentCp === null || bestCp === null) return null;

  const isWhite = ply % 2 === 1;
  const cpDiff = isWhite ? (currentCp - bestCp) : (bestCp - currentCp);

  if (cpDiff >= -10) return 'best';
  if (cpDiff >= -50) return 'good';
  if (cpDiff >= -100) return 'inaccuracy';
  if (cpDiff >= -300) return 'mistake';
  return 'blunder';
}
