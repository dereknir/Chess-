-- 對照 schema.sql 與線上結構後補齊線上缺的東西。可重複執行。
-- 2026-09-10 對照結果：線上只缺這個索引（schema.sql 一直有，但當初沒建）。
create index if not exists chat_messages_game_idx
  on chat_messages (game_id, created_at);
