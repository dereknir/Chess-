import postgres from 'postgres';

// Serverless 環境每次冷啟動都會新建連線，所以連線數壓低、開 prepare: false
// （Supabase / Neon 的 transaction pooler 不支援 prepared statements）。
const sql = postgres(process.env.DATABASE_URL!, {
  max: 1,
  prepare: false,
  idle_timeout: 20,
  ssl: 'require',
});

export default sql;

export type Player = {
  id: string;
  display_name: string;
  token: string;
  discord_id: string | null;
  board_theme: string | null;
};

export type Game = {
  id: number;
  white_id: string;
  black_id: string;
  initial_fen: string;
  current_fen: string;
  turn: 'w' | 'b';
  ply_count: number;
  status: 'ongoing' | 'checkmate' | 'stalemate' | 'draw' | 'resigned';
  result: string | null;
  winner_id: string | null;
  white_takebacks_left: number;
  black_takebacks_left: number;
  pending_draw_offer_by: string | null;
  note: string | null;
  created_at: Date;
  updated_at: Date;
  ended_at: Date | null;
};

export type Move = {
  game_id: number;
  ply: number;
  player_id: string;
  san: string;
  uci: string;
  fen_after: string;
  is_check: boolean;
  is_capture: boolean;
  thinking_ms: number | null;
  created_at: Date;
};

export type ChatMessage = {
  id: number;
  game_id: number;
  player_id: string;
  message: string;
  ply: number | null;
  created_at: Date;
};

export type MoveAnalysis = {
  game_id: number;
  ply: number;
  cp: number | null;
  mate_in: number | null;
  best_move: string | null;
  best_move_san: string | null;
  actual_move_rank: number | null;
  depth: number | null;
  classification: 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | null;
  created_at: Date;
};
