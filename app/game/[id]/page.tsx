import { notFound } from 'next/navigation';
import sql, { type Game, type Move, type Player, type MoveAnalysis, type ChatMessage } from '@/lib/db';
import { currentPlayer } from '@/lib/auth';
import { buildPgn } from '@/lib/chess';
import NoteEditor from './NoteEditor';
import AnalyzeButton from './AnalyzeButton';
import GameReplayPage from './GameReplayPage';

export const dynamic = 'force-dynamic';

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await currentPlayer();
  if (!me) notFound();

  const { id } = await params;
  const [game] = await sql<Game[]>`
    select * from games where id = ${Number(id)}
  `;
  if (!game) notFound();

  const moves = await sql<Move[]>`
    select * from moves where game_id = ${game.id} order by ply
  `;

  const analysis = await sql<MoveAnalysis[]>`
    select * from move_analysis_backup where game_id = ${game.id} order by ply
  `;

  const chatMessages = await sql<ChatMessage[]>`
    select * from chat_messages where game_id = ${game.id} order by created_at
  `;

  const [white] = await sql<Player[]>`
    select * from players where id = ${game.white_id}
  `;
  const [black] = await sql<Player[]>`
    select * from players where id = ${game.black_id}
  `;

  const pgn = buildPgn({
    white: white.display_name,
    black: black.display_name,
    date: game.created_at,
    result: game.result ?? '*',
    initialFen: game.initial_fen,
    sans: moves.map((m) => m.san),
  });

  return (
    <main>
      <div className="verdict">
        <h2>{headline(game, white.display_name, black.display_name)}</h2>
        <p>
          {white.display_name} 執白　·　{Math.ceil(game.ply_count / 2)} 回合　·
          {game.ended_at?.toISOString().slice(0, 10)}
        </p>
      </div>

      <NoteEditor gameId={game.id} initialNote={game.note} />

      <AnalyzeButton
        hasAnalysis={analysis.length > 0}
        analysisStatus={game.analysis_status}
      />

      <GameReplayPage
        initialFen={game.initial_fen}
        fens={moves.map((m) => m.fen_after)}
        orientation={game.white_id === me.id ? 'white' : 'black'}
        moves={moves}
        analysis={analysis.length > 0 ? analysis : undefined}
        pgn={pgn}
        result={game.result ?? ''}
        myId={me.id}
        opponentName={game.white_id === me.id ? black.display_name : white.display_name}
        chatMessages={chatMessages}
      />
    </main>
  );
}

function headline(game: Game, white: string, black: string) {
  if (game.result === '1/2-1/2') {
    return game.status === 'stalemate' ? '逼和' : '和棋';
  }
  const winner = game.result === '1-0' ? white : black;
  const how = game.status === 'resigned' ? '對手認輸' : '將死';
  return `${winner} 獲勝　·　${how}`;
}
