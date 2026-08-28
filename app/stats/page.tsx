import sql, { type Game, type Move, type Player } from '@/lib/db';
import { currentPlayer } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type Stats = {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  totalMoves: number;
  avgThinkingMs: number;
  fastestMove: { san: string; thinkingMs: number; gameId: number } | null;
  slowestMove: { san: string; thinkingMs: number; gameId: number } | null;
  captures: number;
  checks: number;
};

export default async function StatsPage() {
  const me = await currentPlayer();
  if (!me) {
    redirect('/?error=需要登入');
  }

  // 所有已結束的對局
  const games = await sql<Game[]>`
    select * from games
    where (white_id = ${me.id} or black_id = ${me.id})
      and status != 'ongoing'
    order by ended_at desc
  `;

  // 我的所有棋步
  const myMoves = await sql<Move[]>`
    select * from moves
    where player_id = ${me.id}
    order by thinking_ms desc nulls last
  `;

  // 計算戰績
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const game of games) {
    if (game.status === 'draw' || game.status === 'stalemate') {
      draws++;
    } else if (game.winner_id === me.id) {
      wins++;
    } else if (game.winner_id !== null) {
      losses++;
    }
  }

  // 思考時間統計（排除 null）
  const movesWithTime = myMoves.filter((m) => m.thinking_ms !== null);
  const avgThinkingMs =
    movesWithTime.length > 0
      ? movesWithTime.reduce((sum, m) => sum + m.thinking_ms!, 0) /
        movesWithTime.length
      : 0;

  const slowestMove =
    movesWithTime.length > 0
      ? {
          san: movesWithTime[0].san,
          thinkingMs: movesWithTime[0].thinking_ms!,
          gameId: movesWithTime[0].game_id,
        }
      : null;

  const fastestMove =
    movesWithTime.length > 0
      ? {
          san: movesWithTime[movesWithTime.length - 1].san,
          thinkingMs: movesWithTime[movesWithTime.length - 1].thinking_ms!,
          gameId: movesWithTime[movesWithTime.length - 1].game_id,
        }
      : null;

  const captures = myMoves.filter((m) => m.is_capture).length;
  const checks = myMoves.filter((m) => m.is_check).length;

  const stats: Stats = {
    totalGames: games.length,
    wins,
    losses,
    draws,
    totalMoves: myMoves.length,
    avgThinkingMs,
    fastestMove,
    slowestMove,
    captures,
    checks,
  };

  return (
    <main>
      <h1 className="page-title">個人統計</h1>
      <p className="page-lede">{me.display_name} 的對弈紀錄</p>

      <div className="stats-grid">
        {/* 戰績 */}
        <section className="stat-card">
          <h2>戰績</h2>
          <div className="stat-row">
            <span className="label">總對局</span>
            <span className="value">{stats.totalGames}</span>
          </div>
          <div className="stat-row">
            <span className="label">勝</span>
            <span className="value win">{stats.wins}</span>
          </div>
          <div className="stat-row">
            <span className="label">敗</span>
            <span className="value loss">{stats.losses}</span>
          </div>
          <div className="stat-row">
            <span className="label">和</span>
            <span className="value draw">{stats.draws}</span>
          </div>
          {stats.totalGames > 0 && (
            <div className="stat-row">
              <span className="label">勝率</span>
              <span className="value">
                {((stats.wins / stats.totalGames) * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </section>

        {/* 棋步統計 */}
        <section className="stat-card">
          <h2>棋步</h2>
          <div className="stat-row">
            <span className="label">總步數</span>
            <span className="value">{stats.totalMoves}</span>
          </div>
          <div className="stat-row">
            <span className="label">吃子</span>
            <span className="value">{stats.captures}</span>
          </div>
          <div className="stat-row">
            <span className="label">將軍</span>
            <span className="value">{stats.checks}</span>
          </div>
          {stats.totalMoves > 0 && (
            <>
              <div className="stat-row">
                <span className="label">吃子率</span>
                <span className="value">
                  {((stats.captures / stats.totalMoves) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="stat-row">
                <span className="label">將軍率</span>
                <span className="value">
                  {((stats.checks / stats.totalMoves) * 100).toFixed(1)}%
                </span>
              </div>
            </>
          )}
        </section>

        {/* 思考時間 */}
        <section className="stat-card">
          <h2>思考時間</h2>
          {stats.avgThinkingMs > 0 ? (
            <>
              <div className="stat-row">
                <span className="label">平均</span>
                <span className="value">{formatTime(stats.avgThinkingMs)}</span>
              </div>
              {stats.fastestMove && (
                <div className="stat-row">
                  <span className="label">最快</span>
                  <span className="value">
                    {stats.fastestMove.san} ·{' '}
                    {formatTime(stats.fastestMove.thinkingMs)}
                  </span>
                </div>
              )}
              {stats.slowestMove && (
                <div className="stat-row">
                  <span className="label">最慢</span>
                  <span className="value">
                    {stats.slowestMove.san} ·{' '}
                    {formatTime(stats.slowestMove.thinkingMs)}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="empty-note">尚無思考時間紀錄</p>
          )}
        </section>
      </div>
    </main>
  );
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
