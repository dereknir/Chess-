-- 新增步前局面評估欄位（對齊 Lichess）
-- 用於計算 Lichess 風格的準確率和分類

alter table move_analysis
  add column if not exists best_cp int,           -- 步前局面的 CP 值
  add column if not exists best_mate_in int;      -- 步前局面的將死步數

comment on column move_analysis.best_cp is '步前局面的 centipawns 評分（從輪到走的那方視角）';
comment on column move_analysis.best_mate_in is '步前局面的將死步數（從輪到走的那方視角）';
