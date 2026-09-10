-- 聊天可以回覆特定訊息：reply_to 指向同一局的另一則訊息
--
-- 型別要跟 chat_messages.id 一樣是 integer。線上的 id 是 int4，第一版誤用了
-- bigint —— postgres.js 把 int8 回傳成字串、int4 回傳成數字，前端用 id 查
-- 原訊息時 Map 找不到，每則回覆都顯示「原訊息不存在」。
-- 第二句是給已經跑過第一版的資料庫改型別用的，型別已經對的話是 no-op。
alter table chat_messages
  add column if not exists reply_to integer references chat_messages(id);

alter table chat_messages
  alter column reply_to type integer;

comment on column chat_messages.reply_to is '回覆哪一則訊息（同一局的 chat_messages.id），null 代表不是回覆';
