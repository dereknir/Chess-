-- ============================================================
--  通信對弈 schema
--  設計前提：固定兩人、同時只有一盤進行中、完整保留歷史棋局
-- ============================================================

-- ---------- players ----------
-- 兩筆固定資料。token 就是秘密網址的憑證。
create table players (
  id           text primary key,          -- 'derek' | 'friend'
  display_name text        not null,
  token        text        not null unique,
  discord_id   text,                      -- 用來 <@id> 強制推播，可為 null
  board_theme  text,                      -- lib/themes.ts 的 id；null = 經典
  created_at   timestamptz not null default now()
);

-- ---------- games ----------
create table games (
  id           bigserial   primary key,
  white_id     text        not null references players(id),
  black_id     text        not null references players(id),

  initial_fen  text        not null,      -- 支援殘局起始；標準開局也照存
  current_fen  text        not null,      -- 最新局面，列表頁直接拿來渲染
  turn         char(1)     not null,      -- 'w' | 'b'
  ply_count    int         not null default 0,

  status       text        not null default 'ongoing',
  -- ongoing | checkmate | stalemate | draw | resigned
  result       text,                      -- '1-0' | '0-1' | '1/2-1/2'
  winner_id    text        references players(id),

  -- 悔棋：每人每局 2 次，用掉就扣
  white_takebacks_left int not null default 2,
  black_takebacks_left int not null default 2,

  -- 提和：誰提的就記誰，對方接受或拒絕後清回 null。
  -- 接受的話 status 走既有的 'draw'，不另開狀態。
  pending_draw_offer_by text references players(id),

  note         text,                      -- 這局的備註（「某某開局」之類）
  analysis_status text,                   -- 'pending' | 'running' | 'done' | 'error'，AnalyzeButton 在看

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  ended_at     timestamptz,

  constraint different_players check (white_id <> black_id),
  constraint valid_turn        check (turn in ('w','b')),
  constraint valid_status      check (status in
    ('ongoing','checkmate','stalemate','draw','resigned')),
  -- 結束的局一定要有結果，進行中的一定不能有
  constraint result_matches_status check (
    (status = 'ongoing' and result is null and ended_at is null) or
    (status <> 'ongoing' and result is not null and ended_at is not null)
  )
);

-- 同時只准一盤進行中。
-- 技巧：對 status 建 partial unique index，因為符合條件的列 status 恆等於
-- 'ongoing'，唯一性等於「最多一列」。第二盤 insert 會直接被資料庫擋掉。
create unique index only_one_ongoing_game
  on games (status)
  where status = 'ongoing';

create index games_ended_at_idx on games (ended_at desc nulls first);

-- ---------- moves ----------
-- 每一步都留一列。這張表是之後所有分析的來源。
create table moves (
  game_id      bigint      not null references games(id) on delete cascade,
  ply          int         not null,      -- 半步序號，從 1 開始
  player_id    text        not null references players(id),

  san          text        not null,      -- 'Nf3'、'O-O'、'exd5'（人類看的）
  uci          text        not null,      -- 'g1f3'（程式看的，也給棋盤圖用）
  fen_after    text        not null,      -- 這步走完後的完整 FEN

  is_check     boolean     not null default false,
  is_capture   boolean     not null default false,
  thinking_ms  bigint,                    -- 距離上一步過了多久

  created_at   timestamptz not null default now(),

  primary key (game_id, ply)
);

create index moves_player_idx on moves (player_id, created_at desc);

-- ---------- chat_messages ----------
-- 對局中的留言。ChatBox 讀寫，複盤頁唯讀。
-- id / game_id 是 int4 不是 bigint：線上這張表當初是手動建的，就是 int4。
-- 這裡照線上寫，不要「修正」成 bigserial —— postgres.js 把 int8 回成字串、
-- int4 回成數字，reply_to 跟 id 型別一不一致，前端用 id 查原訊息就會找不到。
create table chat_messages (
  id           serial      primary key,
  game_id      integer     not null references games(id) on delete cascade,
  player_id    text        not null references players(id),
  message      text        not null,      -- 應用層限 500 字
  ply          int,                       -- 發言當下走到第幾 ply，null 代表局前
  reply_to     integer     references chat_messages(id),  -- 回覆哪一則，同一局；型別要跟 id 一致
  created_at   timestamptz not null default now()
);

create index chat_messages_game_idx on chat_messages (game_id, created_at);

-- ---------- move_analysis ----------
-- Lichess Cloud Eval 的結果，一步一列。analyzeGame() 寫，複盤頁讀。
-- cp / mate_in 都是「輪到走的那方」視角，EvaluationGraph 自己翻成白方視角。
create table move_analysis (
  game_id      integer     not null references games(id) on delete cascade,
  ply          int         not null,
  cp           int,                       -- centipawns
  mate_in      int,                       -- 幾步將死，正=走的人贏
  best_cp      int,                       -- 步前最佳走法的評分（同視角）
  best_mate_in int,
  best_move    text,                      -- UCI，'e2e4'
  best_move_san text,                     -- SAN，'e4'
  actual_move_rank int,                   -- 實際走法在建議裡排第幾，1 = 最佳
  depth        int,
  classification text,                    -- best | good | inaccuracy | mistake | blunder
  created_at   timestamptz not null default now(),
  primary key (game_id, ply)
);

create index idx_move_analysis_game on move_analysis (game_id);
create index idx_move_analysis_classification on move_analysis (classification);


-- ============================================================
--  Seed
--
--  token 就是秘密網址的憑證，不要把真的值寫回這個檔案（它會進 git）。
--  建表後直接在 DB 裡改：
--    update players set token = '...' where id = 'derek';
--    update players set token = '...' where id = 'friend';
-- ============================================================
insert into players (id, display_name, token, discord_id) values
  ('derek',  'Derek',  'CHANGE_ME_BEFORE_DEPLOY', null),
  ('friend', '對手',   'CHANGE_ME_TOO',           null);


-- ============================================================
--  補給既有資料庫用
--
--  上面的 create table 是給全新資料庫的，對已經在跑的 DB 直接跑會撞
--  "already exists"。線上那套是後來一路手動加欄位的，這段把它補齊，
--  可以重複執行。整段貼進 Neon 的 SQL Editor 就好。
--
--    alter table players add column if not exists board_theme text;
--
--    alter table games add column if not exists
--      white_takebacks_left int not null default 2;
--    alter table games add column if not exists
--      black_takebacks_left int not null default 2;
--    alter table games add column if not exists
--      pending_draw_offer_by text references players(id);
--    alter table games add column if not exists note text;
--    alter table games add column if not exists analysis_status text;
--
--    create table if not exists chat_messages (
--      id         serial      primary key,
--      game_id    integer     not null references games(id) on delete cascade,
--      player_id  text        not null references players(id),
--      message    text        not null,
--      created_at timestamptz not null default now()
--    );
--    create index if not exists chat_messages_game_idx
--      on chat_messages (game_id, created_at);
--    alter table chat_messages add column if not exists ply int;
--    alter table chat_messages add column if not exists
--      reply_to integer references chat_messages(id);
--
--    move_analysis 整張表：跑 migrations/add-move-analysis.sql，
--    再跑 migrations/add-best-eval-fields.sql。
--
--  對照線上結構用這句（information_schema 才是真相，這個檔案是抄它的）：
--    select table_name, column_name, data_type, is_nullable, column_default
--    from information_schema.columns where table_schema = 'public'
--    order by table_name, ordinal_position;
-- ============================================================


-- ============================================================
--  之後可能會用到的分析查詢，先放這裡當備忘
-- ============================================================

-- 各自的平均思考時間（秒）
--   select player_id,
--          round(avg(thinking_ms) / 1000.0, 1) as avg_sec,
--          count(*) as moves
--   from moves
--   group by player_id;

-- 歷史戰績
--   select
--     count(*) filter (where winner_id = 'derek')  as derek_wins,
--     count(*) filter (where winner_id = 'friend') as friend_wins,
--     count(*) filter (where winner_id is null)    as draws
--   from games
--   where status <> 'ongoing';

-- 匯出某局 PGN 的 movetext（丟 Lichess Import 用）
--   select string_agg(
--            case when ply % 2 = 1
--                 then ((ply + 1) / 2)::text || '. ' || san
--                 else san end,
--            ' ' order by ply)
--   from moves where game_id = $1;
