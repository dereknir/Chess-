# 通信對弈

兩人專用的西洋棋對弈站。一方落子，另一方的 Discord 就收到推播。

- 同時只有一盤進行中，隨時中斷隨時接續
- 每一步都留紀錄（SAN、UCI、局面、思考時間）
- 可以從殘局開局：貼 FEN 或直接擺子
- 一鍵複製 PGN，丟到 Lichess 拿 Stockfish 分析

## 需要準備的東西

| 項目 | 說明 |
|---|---|
| Postgres | Neon 或 Supabase 免費方案就夠 |
| Discord 私人伺服器 | 一個頻道，一條 webhook |
| Vercel | 免費方案 |

### 環境變數

```
DATABASE_URL=postgres://...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/.../...
APP_URL=https://your-app.vercel.app

# 選配：推播裡的棋盤圖
# 不設 → 用 chessvision.ai 的 fen2image（第三方）
# BOARD_IMAGE=off              → 不放圖，只留棋步和連結
# BOARD_IMAGE_BASE=https://... → 自架 lila-gif 的 /image.gif
```

## 上線步驟

1. **建資料庫**，跑 `schema.sql`
2. **改掉 Derek 的 token** —— seed 裡是 `CHANGE_ME_BEFORE_DEPLOY`：
   ```sql
   update players set token = '你自己想的字串' where id = 'derek';
   ```
3. **建 Discord webhook**
   私人伺服器 → 頻道右鍵「編輯頻道」→ 整合 → 建立 Webhook → 複製網址。
   不用建 bot、不用審核、不用 OAuth。
4. **填 Discord user ID**
   Discord 設定 → 進階 → 開「開發者模式」，右鍵頭像複製 ID：
   ```sql
   update players set discord_id = '...' where id = 'derek';
   update players set discord_id = '...' where id = 'friend';
   ```
   沒填也能跑，只是不會 @ 人，對方靜音頻道就收不到推播。
5. **部署到 Vercel**，設好環境變數
6. **各自開一次專屬網址**
   ```
   https://your-app.vercel.app/?as=<derek 的 token>
   https://your-app.vercel.app/?as=RamenOrSausageEgg
   ```
   開過一次就寫進 cookie，之後直接進首頁。

## 檔案

```
schema.sql              資料表 + seed + 幾個備忘用的分析查詢
lib/db.ts               連線與型別
lib/auth.ts             秘密網址認證
lib/chess.ts            chess.js 包裝：走子、終局判定、PGN 產生
lib/discord.ts          webhook 推播
app/actions.ts          playMove / newGame / resign
app/page.tsx            目前這盤，或開局表單
app/NewGame.tsx         開局表單（含擺子編輯器）
app/Board.tsx           可下棋的棋盤
app/MoveLog.tsx         記譜表
app/history/page.tsx    歷史對局與戰績
app/game/[id]/          單局重播
tests/                  chess.js 邏輯的測試
```

## 跑測試

```bash
npm i chess.js
node tests/chess.test.mjs     # 走子、入堡、過路兵、終局、PGN round-trip
node tests/editor.test.mjs    # 擺子編輯器的 FEN 解析與往返
```

測試是直接複製 `lib/chess.ts` 和 `NewGame.tsx` 的邏輯貼進去跑的（沒有建置步驟），
所以**改動那兩個檔案時記得同步更新測試檔**。

## 設計決定

**規則判定全部交給 chess.js。** 入堡的四個條件、吃過路兵、升變、三次重複、逼和——自己刻一定會漏掉某個邊界情況。

**踩過的坑：`move.isCapture()` 對吃過路兵回傳 false。** chess.js 只認 flag `'c'`，而過路兵的 flag 是 `'e'`。改用 `move.captured !== undefined`，兩種都涵蓋。不修的話所有過路兵都會被記成沒吃子，之後統計會少算。

**「同時只有一盤」在資料庫層擋。** `games` 上的 partial unique index：對 `status` 建索引、條件 `where status = 'ongoing'`。符合條件的列 status 恆等於 `'ongoing'`，唯一性就等於「最多一列」。應用層就算有 bug 也開不出第二盤。

**併發保護兩層。** `select ... for update` 鎖住棋局；`expectedPly` 比對擋掉「開著舊分頁按下去」——早上在電腦開頁面、中午在手機走了一步、晚上回電腦點舊分頁，會被擋下來要求重新整理，而不是走出一步鬼棋。

**Token 進站後從網址移除。** 第一次 `?as=xxx` 進來寫進 cookie 就 redirect，避免截圖或分享棋局連結時把憑證一起洩出去。

**手擺局面會清掉入堡權和過路兵格。** 手動擺出來的棋盤沒有「王有沒有動過」這段歷史，保留原本的 `KQkq` 會讓系統允許不該有的入堡。

**推播用 `after()`。** 落子的 response 先回，Discord 請求晚一步跑。推播失敗只記 log，不會讓落子失敗。

**分析不自己做。** `buildPgn()` 產生的 PGN 直接貼到 Lichess 的 Import game，就拿到 Stockfish 標好的失誤與準確率。自己跑引擎划不來。

## 還沒做的

- [ ] 提和（認輸已經有了）
- [ ] 升變選子（目前一律升后，99% 的情況都對）
- [ ] 「上一步」高亮
- [ ] 用 `moves` 表做統計頁：平均思考時間、各自的失誤分佈
