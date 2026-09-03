-- 新增步前最佳走法的評估值欄位
-- 用於計算 Lichess 風格的準確率

alter table move_analysis
  add column if not exists best_cp int,           -- 步前最佳走法的 CP 值
  add column if not exists best_mate_in int;      -- 步前最佳走法的將死步數

comment on column move_analysis.best_cp is '步前最佳走法的 centipawns 評分（從輪到走的那方視角）';
comment on column move_analysis.best_mate_in is '步前最佳走法的將死步數（從輪到走的那方視角）';
