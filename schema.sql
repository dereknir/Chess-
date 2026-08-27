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
