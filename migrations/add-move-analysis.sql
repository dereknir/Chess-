-- 移動分析表：儲存 Lichess Cloud Eval 的結果
create table if not exists move_analysis (
  game_id int not null references games(id) on delete cascade,
  ply int not null,
  cp int,                        -- centipawns 評分 (白方視角: 正=白優, 負=黑優)
  mate_in int,                   -- 如果是將死局面，幾步將死 (正=白勝, 負=黑勝)
  best_move text,                -- UCI 格式的最佳走法 (e.g. "e2e4")
  best_move_san text,            -- SAN 格式的最佳走法 (e.g. "e4")
  actual_move_rank int,          -- 實際走法在建議中排第幾 (1=最佳, 2=次佳...)
  depth int,                     -- Stockfish 搜尋深度
  classification text,           -- 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'
  created_at timestamptz not null default now(),
  primary key (game_id, ply)
);

-- 索引：快速查詢某局的所有分析
create index if not exists idx_move_analysis_game on move_analysis(game_id);

-- 索引：找出所有失誤（用於統計）
create index if not exists idx_move_analysis_classification on move_analysis(classification);
