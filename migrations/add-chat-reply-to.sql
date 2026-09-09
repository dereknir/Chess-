-- 聊天可以回覆特定訊息：reply_to 指向同一局的另一則訊息
alter table chat_messages
  add column if not exists reply_to bigint references chat_messages(id);

comment on column chat_messages.reply_to is '回覆哪一則訊息（同一局的 chat_messages.id），null 代表不是回覆';
