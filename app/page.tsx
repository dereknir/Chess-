import { redirect } from 'next/navigation';
import sql, { type Game, type Move, type Player } from '@/lib/db';
import { currentPlayer } from '@/lib/auth';
import { buildPgn } from '@/lib/chess';
import Board from './Board';
import NewGame from './NewGame';
import MoveLog from './MoveLog';
import PgnButton from './PgnButton';
import RealtimeRefresh from './RealtimeRefresh';

export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;

  // 第一次用秘密網址進站：轉去 /enter 記進 cookie，然後把 token 從網址上拿掉 ——
  // 免得之後截圖或分享連結時把憑證一起送出去。
  // (寫 cookie 不能在 Server Component 裡做,所以交給 app/enter/route.ts)
  if (as) {
    redirect(`/enter?as=${encodeURIComponent(as)}`);
  }

  const me = await currentPlayer();
  if (!me) {
    return (
      <main className="empty">
        <h1>這裡需要一次專屬網址</h1>
        <p>
          跟對方要你的那條連結，開一次就會記住，之後直接進首頁就好。
        </p>
      </main>
    );
  }

  const [game] = await sql<Game[]>`
    select * from games where status = 'ongoing' limit 1
  `;

  // ---------- 沒有進行中的棋局：開局表單 ----------
  if (!game) {
    const players = await sql<Player[]>`
      select id, display_name, token, discord_id from players order by id
    `;
    return (
      <main>
        <NewGame
          players={players.map((p) => ({
            id: p.id,
            display_name: p.display_name,
          }))}
          myId={me.id}
        />
      </main>
    );
  }

  // ---------- 有棋局 ----------
  const moves = await sql<Move[]>`
    select * from moves where game_id = ${game.id} order by ply
  `;

  const [white, black] = await Promise.all([
    one(game.white_id),
    one(game.black_id),
  ]);

  const myColor = game.white_id === me.id ? 'w' : 'b';
  const opponent = myColor === 'w' ? black : white;
  const myTakebacksLeft =
    myColor === 'w' ? game.white_takebacks_left : game.black_takebacks_left;

  return (
    <main>
      <RealtimeRefresh gameId={game.id} enabled={game.status === 'ongoing'} />
      <div className="game">
        <Board
          gameId={game.id}
          fen={game.current_fen}
          myColor={myColor}
          isMyTurn={game.turn === myColor}
          plyCount={game.ply_count}
          opponentName={opponent.display_name}
          myTakebacksLeft={myTakebacksLeft}
        />

        <MoveLog
          moves={moves}
          initialFen={game.initial_fen}
          caption={`${white.display_name} 執白`}
          footer={
            <PgnButton
              pgn={buildPgnFor(game, moves, white.display_name, black.display_name)}
            />
          }
        />
      </div>
    </main>
  );
}

async function one(id: string) {
  const [p] = await sql<Player[]>`
    select id, display_name, token, discord_id from players where id = ${id}
  `;
  return p;
}

function buildPgnFor(
  game: Game,
  moves: Move[],
  white: string,
  black: string,
) {
  return buildPgn({
    white,
    black,
    date: game.created_at,
    result: game.result ?? '*',
    initialFen: game.initial_fen,
    sans: moves.map((m) => m.san),
  });
}
