import sql, { type Player } from '@/lib/db';
import { currentPlayer } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Row = {
  id: number;
  result: string;
  ended_at: Date;
  status: string;
  ply_count: number;
  white_id: string;
  white_name: string;
  black_name: string;
  winner_id: string | null;
  winner_name: string | null;
  note: string | null;
};

export default async function History() {
  const me = await currentPlayer();
  if (!me) {
    return (
      <main className="empty">
        <h1>這裡需要一次專屬網址</h1>
        <p>跟對方要你的那條連結。</p>
      </main>
    );
  }

  const games = await sql<Row[]>`
    select g.id, g.result, g.ended_at, g.status, g.ply_count, g.note,
           g.white_id, g.winner_id,
           w.display_name as white_name,
           b.display_name as black_name,
           n.display_name as winner_name
    from games g
    join players w on w.id = g.white_id
    join players b on b.id = g.black_id
    left join players n on n.id = g.winner_id
    where g.status <> 'ongoing'
    order by g.ended_at desc
  `;

  const players = await sql<Player[]>`select * from players order by id`;
  const tally = players.map((p) => ({
    name: p.display_name,
    wins: games.filter((g) => g.winner_name === p.display_name).length,
  }));
  const draws = games.filter((g) => g.winner_name === null).length;

  if (games.length === 0) {
    return (
      <main className="empty">
        <h1>還沒有下完的棋局</h1>
        <p>下完第一盤之後就會出現在這裡。</p>
      </main>
    );
  }

  return (
    <main>
      <div className="verdict">
        <h2>
          {tally.map((t) => `${t.name} ${t.wins}`).join('　—　')}
          {draws > 0 && `　（和 ${draws}）`}
        </h2>
        <p>共 {games.length} 盤</p>
      </div>

      <ul className="records">
        {games.map((g) => (
          <li key={g.id}>
            <a href={`/game/${g.id}`}>
              <span className="score">{g.result}</span>
              <div>
                <div className="line">
                  {g.white_name}
                  <span className="side">(白)</span> 對 {g.black_name}
                  <span className="side">(黑)</span>

                  <span style={{ color: 'var(--dim)', fontSize: 12 }}>
                    {describe(g)}
                  </span>
                </div>
                {g.note && (
                  <div className="record-note">{g.note}</div>
                )}
              </div>
              <span className="when">
                {g.ended_at.toISOString().slice(0, 10)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

function describe(g: Row) {
  const moveCount = Math.ceil(g.ply_count / 2);
  // 用 id 比對而不是 display_name，兩人同名時才不會認錯
  const loser = g.winner_id === g.white_id ? g.black_name : g.white_name;

  switch (g.status) {
    case 'resigned':
      return `${loser} 認輸　${moveCount} 回合`;
    case 'checkmate':
      return `${g.winner_name} 將死　${moveCount} 回合`;
    case 'stalemate':
      return `逼和　${moveCount} 回合`;
    case 'draw':
      return `和棋　${moveCount} 回合`;
    // 兜底不要說成「和棋」——之後多一種結束方式就會默默說謊
    default:
      return `${g.status}　${moveCount} 回合`;
  }
}
