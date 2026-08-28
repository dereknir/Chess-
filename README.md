# 自食棋力

兩人專用的西洋棋對弈站。一方落子，另一方的 Discord 就收到推播。

- 同時只有一盤進行中，隨時中斷隨時接續
- 每一步都留紀錄（SAN、UCI、局面、思考時間）
- 可以從殘局開局：貼 FEN 或直接擺子
- 一鍵複製 PGN，丟到 Lichess 拿 Stockfish 分析

## 本機開發

```bash
npm install
cp .env.example .env.local    # 填值，見下
npm run dev
```

第一次要用 `http://localhost:3000/?as=<你的 token>` 進站，token 寫進 cookie 後就
可以直接開首頁。token 在 `players` 表裡，`schema.sql` 的 seed 是佔位字串，
建好 DB 之後記得 update 成自己的。

### 環境變數

```
DATABASE_URL=postgres://...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/.../...
APP_URL=https://your-app.vercel.app

# Pusher Channels（即時推播：對方下完棋立刻刷新頁面）
PUSHER_APP_ID=...
PUSHER_SECRET=...
NEXT_PUBLIC_PUSHER_KEY=...
NEXT_PUBLIC_PUSHER_CLUSTER=ap1

# 選配：推播裡的棋盤圖
# 不設 → 用 chessvision.ai 的 fen2image（第三方）
# BOARD_IMAGE=off              → 不放圖，只留棋步和連結
# BOARD_IMAGE_BASE=https://... → 自架 lila-gif 的 /image.gif
```

**Neon 的連線字串結尾要手動拿掉 `&channel_binding=require`。**
postgres.js 會把它當成啟動參數送給伺服器，而 Postgres 不認得這個參數名，
留著會連不上。換機器重裝時最容易再踩一次。

## 檔案

```
schema.sql               資料表 + seed + 補給既有 DB 的欄位 + 備忘查詢
lib/db.ts                連線與型別
lib/auth.ts              秘密網址認證：token → cookie
lib/chess.ts             chess.js 包裝：走子、終局判定、局面比對、PGN 產生
lib/discord.ts           webhook 推播
lib/pusher.ts            Pusher 後端實例（即時推播）
lib/themes.ts            棋盤配色定義
app/actions.ts           playMove / newGame / resign / takeback / 提和 / 備註 / 主題
app/enter/route.ts       秘密網址的落點：驗 token、寫 cookie、導回首頁
app/RealtimeRefresh.tsx  訂閱 Pusher 事件，對方下完立刻刷新
app/layout.tsx           外框與導覽
app/globals.css          全部樣式（沒有用 Tailwind）
app/icon.png             favicon：貓頭 + 深色圓角底
app/apple-icon.png       iOS 加到主畫面的圖示
public/rose.png          header 的貓：暖白線稿、透明底
app/page.tsx             目前這盤，或開局表單
app/NewGame.tsx          開局表單（含擺子編輯器）
app/Board.tsx            可下棋的棋盤（含落點提示、上一步高亮、悔棋、提和）
app/MoveLog.tsx          記譜表
app/PgnButton.tsx        複製 PGN
app/ThemeSelector.tsx    棋盤配色切換
app/history/page.tsx     歷史對局與戰績
app/stats/page.tsx       個人統計
app/game/[id]/           單局重播（含備註編輯）
tests/                   棋規與擺子編輯器的測試
```

`schema.sql` 上面的 `create table` 是給全新資料庫用的；線上那套是一路手動加欄位
長出來的，所以檔案下半部另外留了一段可重複執行的 `alter table`，補欄位時貼那段。

## 跑測試

```bash
npm test
```

或分開跑：

```bash
node tests/chess.test.mjs     # 走子、入堡、過路兵、終局、三次重複、PGN round-trip
node tests/editor.test.mjs    # 擺子編輯器的 FEN 解析與往返
```

測試是直接複製 `lib/chess.ts`、`NewGame.tsx` 和 `playMove` 的判定邏輯貼進去跑的
（沒有建置步驟），所以**改動那些檔案時記得同步更新測試檔**。

## 設計決定

**單步規則判定全部交給 chess.js。** 入堡的四個條件、吃過路兵、升變、逼和、50 步規則——自己刻一定會漏掉某個邊界情況。

**唯一的例外是三次重複，那要自己數。** `applyMove` 每步都是 `new Chess(fen)` 重建，實例裡沒有歷史局面，所以 `isThreefoldRepetition()` 永遠回傳 false——這條曾經寫在 `readOutcome` 裡，是死碼，重複再多次也判不出和棋。現在改成在 `playMove` 裡撈該局的 `initial_fen` 加上所有 `moves.fen_after`，數同一個局面出現幾次，滿三次就判和。比對局面只看 FEN 的前四欄（盤面、行動方、入堡權、過路兵格），後兩欄是半步計時和回合數，算進去的話同一個局面永遠不會相等。

**踩過的坑：`move.isCapture()` 對吃過路兵回傳 false。** chess.js 只認 flag `'c'`，而過路兵的 flag 是 `'e'`。改用 `move.captured !== undefined`，兩種都涵蓋。不修的話所有過路兵都會被記成沒吃子，之後統計會少算。

**「同時只有一盤」在資料庫層擋。** `games` 上的 partial unique index：對 `status` 建索引、條件 `where status = 'ongoing'`。符合條件的列 status 恆等於 `'ongoing'`，唯一性就等於「最多一列」。應用層就算有 bug 也開不出第二盤。

**併發保護兩層。** `select ... for update` 鎖住棋局；`expectedPly` 比對擋掉「開著舊分頁按下去」——早上在電腦開頁面、中午在手機走了一步、晚上回電腦點舊分頁，會被擋下來要求重新整理，而不是走出一步鬼棋。

**Token 進站後從網址移除。** 第一次 `?as=xxx` 進來寫進 cookie 就 redirect，避免截圖或分享棋局連結時把憑證一起洩出去。

**手擺局面會清掉入堡權和過路兵格。** 手動擺出來的棋盤沒有「王有沒有動過」這段歷史，保留原本的 `KQkq` 會讓系統允許不該有的入堡。

**推播用 `after()`。** 落子的 response 先回，Discord 請求晚一步跑。推播失敗只記 log，不會讓落子失敗。

**貓是暖白線稿，favicon 自己帶底色。** 原圖是黑線畫在白底上，站上是深色的，所以線條重新上成 `--chalk` 的暖白、白底去掉，米色斑紋保留。header 那隻直接疊在深色底上就好；favicon 不行——分頁列的顏色不歸網站控制，暖白線條在淺色分頁列上會消失，所以圖示自己帶一塊 `--felt` 的深色圓角底，深淺兩種分頁列都看得見。favicon 另外只裁頭部並加粗線條，整隻貓縮到 16px 只會是一團灰。

**分析不自己做。** `buildPgn()` 產生的 PGN 直接貼到 Lichess 的 Import game，就拿到 Stockfish 標好的失誤與準確率。自己跑引擎划不來。

## 已完成功能

- ✅ **即時推播**：對方下完棋 < 1 秒自動刷新頁面（Pusher Channels）
- ✅ **悔棋**：每人每局 2 次，刪掉自己剛下的步
- ✅ **落點提示**：點選棋子顯示合法走法（綠點 = 普通走法、紅環 = 吃子）
- ✅ **步數與子數顯示**：即時顯示目前第幾步、雙方剩餘棋子數
- ✅ **三次重複和棋判定**：自動比對歷史局面，滿 3 次宣告和棋

## 待實裝

- [ ] **「上一步」高亮**：把剛走的那步起點和終點標出來（視覺回饋）
- [ ] **提和功能**：雙方同意和棋（認輸已經有了）
- [ ] **升變選子**：兵升變時彈出選單選擇子種（目前一律升后）
- [ ] **統計頁面**：用 `moves` 表做個人統計：平均思考時間、最快/最慢的棋、吃子分佈
- [ ] **棋局備註**：每局可以加個簡短註解（例如「某某開局」「紀念局」）
