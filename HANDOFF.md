# 交接說明：通信對弈（correspondence chess）

## 這是什麼

我和一個朋友兩個人用的西洋棋通信對弈網站。一方落子，另一方的 Discord 收到推播。
一天走個幾步，不是即時對戰。

Next.js 15 App Router + Postgres（Neon）+ Discord webhook，部署到 Vercel。

**這些檔案是設計好的，不是草稿。** 已經有明確的架構決定和一份通過的測試。
你的任務是讓它跑起來並部署，不是重新設計它。改動前請先看下面的「不要動的地方」。

---

## 目前狀態

### 已經完成（不用重做）

- 全部原始碼已寫好，共 22 個檔案
- 資料庫已建好：Neon，region 是 `ap-southeast-1`（新加坡）
- `schema.sql` 已在 Neon 的 SQL Editor 執行過，`players` 兩筆資料已 seed
- Discord webhook 已建好，網址我有
- `DATABASE_URL` 我有（Pooled connection）
- 測試已寫好且全數通過（`tests/` 底下兩個檔案，32 個測試）

### 還沒做（你的任務）

1. `npm install`，讓專案在本機跑起來
2. 修掉本機跑起來會遇到的錯（下面有我預期會出問題的幾個點）
3. 驗證核心流程能動
4. 推上 GitHub、部署到 Vercel

---

## 專案結構

```
schema.sql              資料表 + seed（已在 Neon 跑過）
lib/db.ts               postgres.js 連線與型別
lib/auth.ts             秘密網址認證（?as=token → cookie）
lib/chess.ts            chess.js 包裝：走子、終局判定、PGN 產生
lib/discord.ts          webhook 推播
app/actions.ts          Server Actions：playMove / newGame / resign
app/page.tsx            目前這盤，或開局表單
app/NewGame.tsx         開局表單（含擺子編輯器）
app/Board.tsx           可下棋的棋盤
app/MoveLog.tsx         記譜表
app/PgnButton.tsx       複製 PGN
app/layout.tsx          外框
app/globals.css         全部樣式（沒有用 Tailwind）
app/history/page.tsx    歷史對局與戰績
app/game/[id]/          單局重播
tests/                  chess.js 邏輯的測試（純 node，不需建置）
```

---

## 環境變數

我會自己把值填進 `.env.local`。你只要知道有這幾個：

```
DATABASE_URL          Neon Pooled connection
DISCORD_WEBHOOK_URL   Discord 頻道 webhook
APP_URL               本機是 http://localhost:3000
BOARD_IMAGE           選配，設 off 就不在推播裡放棋盤圖
BOARD_IMAGE_BASE      選配，自架 lila-gif 的網址
```

`.env.example` 有完整說明。

**注意**：Neon 給的連線字串結尾有 `&channel_binding=require`，我已經手動拿掉了。
postgres.js 會把它當成啟動參數送給伺服器，而 Postgres 不認得這個參數名。
如果你看到我的 `.env.local` 裡沒有這段，那是刻意的，不要幫我加回去。

---

## 我預期你會遇到的問題

這幾個是我事先想到的，遇到就照下面處理。沒遇到就跳過。

### 1. `next.config.mjs` 的 `experimental.after`

```js
experimental: { after: true }
```

`after()` 在 Next.js 15.1 之後已經是穩定 API，不再需要這個 flag。
如果安裝到的 Next 版本 >= 15.1，這個 key 會噴 unrecognized 警告或錯誤。

**處理**：確認 `next` 實際版本，如果 >= 15.1 就把整個 `experimental` 區塊刪掉，
`import { after } from 'next/server'` 保持不變。

### 2. `layout.tsx` 的 next/font

```ts
import { Noto_Serif_TC } from 'next/font/google';
```

CJK 字型透過 next/font 載入常常出問題（subset 驗證失敗、或建置變得極慢）。

**處理**：如果會報錯或明顯拖慢建置，**直接把 next/font 整段拿掉**，
`<html>` 上的 `className={serif.variable}` 也移除。
`globals.css` 的 `--serif` 已經有系統字型 fallback（`"Songti TC", Georgia, serif`），
不載入 webfont 也完全能看。不要為了留住字型花太多時間。

### 3. `app/actions.ts` 裡 `notice` 變數的型別

```ts
let notice: Parameters<typeof notifyMove>[0] | null = null;
await sql.begin(async (tx) => { ... notice = {...}; });
if (notice) after(() => notifyMove(notice!));
```

TypeScript 的控制流分析可能看不到「在 callback 裡被賦值」，
導致 `notice` 在後面被窄化成 `null` 甚至 `never`。

**處理**：只調整型別寫法（例如換個變數名、用陣列裝、或加型別斷言）。
**不要為了繞過型別錯誤而改動交易的結構**——`select ... for update` 加上
`expectedPly` 比對是刻意的併發保護，拆掉會出 bug。

### 4. 缺 `next-env.d.ts`

第一次 `next dev` 會自動生成。它在 `.gitignore` 裡，不用手動建。

---

## 不要動的地方

這些是刻意的設計決定，看起來像 bug 但不是。改之前先問我。

### `react-chessboard` 必須停在 v4

`package.json` 鎖了 `^4.7.3`。v5 把 API 全改成單一 `options` prop，
`Board.tsx`、`NewGame.tsx`、`Replay.tsx` 三個檔案都會壞。**不要升級。**

### `move.captured !== undefined` 不要改回 `move.isCapture()`

`lib/chess.ts` 裡：

```ts
isCapture: move.captured !== undefined,
```

這是修過的 bug。chess.js 的 `isCapture()` 只認 flag `'c'`，
而吃過路兵的 flag 是 `'e'`，會回傳 `false`。已用測試驗證過。

### `games` 上的 partial unique index

```sql
create unique index only_one_ongoing_game on games (status) where status = 'ongoing';
```

這是用來保證「同時只有一盤進行中」的。符合條件的列 status 恆等於 `'ongoing'`，
唯一性就等於「最多一列」。看起來很怪但是對的，不要改成一般索引或拿掉。

### 認證方式不要換

`lib/auth.ts` 的秘密網址 + cookie 是刻意選的。
只有兩個使用者，不需要 OAuth、magic link 或 Neon Auth。不要「升級」它。

### 不要重排版整個專案

沒有用 Tailwind，樣式全在 `app/globals.css`。不要引入 CSS 框架、
不要把 CSS 改成 CSS Modules、不要重寫設計。

### `tests/` 裡的邏輯是複製的

測試檔為了不需要建置步驟，是直接把 `lib/chess.ts` 和 `NewGame.tsx` 的
函式複製進去的純 `.mjs`。**如果你改了那兩個原始檔的邏輯，記得同步更新測試檔。**

---

## 任務清單

### A. 讓它在本機跑起來

```bash
npm install
npm run dev
```

修掉遇到的錯（參考上面「我預期你會遇到的問題」）。
每修一個，說明你改了什麼、為什麼。

### B. 跑測試確認邏輯沒被弄壞

```bash
node tests/chess.test.mjs     # 應該 21 通過 0 失敗
node tests/editor.test.mjs    # 應該 11 通過 0 失敗
```

### C. 驗證核心流程

我會自己在瀏覽器點，但你先確認這些路徑不會 500：

1. `/?as=<token>` → 應該寫 cookie 後 redirect 到 `/`，網址列的 token 消失
2. `/` 沒有進行中棋局 → 顯示開局表單
3. 開一盤標準開局 → 顯示棋盤，執白方能拖動棋子
4. 走一步 → 記譜表出現該步，Discord 頻道收到訊息
5. 用另一個 token（無痕視窗）→ 棋盤翻轉，換那邊能走
6. `/history` → 沒下完的局時顯示空狀態，不報錯
7. 開局表單切到「接續殘局」→ 擺子編輯器能放子、能清子、FEN 同步更新

如果 4. 的 Discord 沒收到，先確認不是 `players.discord_id` 是 null 造成的
（那只會少 @ 人，訊息本身還是要送出）。

### D. 部署

1. 建 `.gitignore` 檢查（已經有一份，確認 `.env.local` 有被排除）
2. `git init`、commit、推到我指定的 GitHub repo
3. Vercel：Import repo，Framework 應自動偵測 Next.js
4. Environment Variables 填 `DATABASE_URL`、`DISCORD_WEBHOOK_URL`
5. Deploy
6. **拿到網址後**，回 Settings 加上 `APP_URL=https://實際網址`，然後 Redeploy
   （沒設的話 Discord 推播裡的連結會指到 localhost）
7. Vercel Settings → Functions → Region 設成 **Singapore (sin1)**
   資料庫在新加坡，function 要放同一區，不然每次落子的多條 SQL 來回會很慢

---

## 部署後我要自己做的

不用你處理，列出來讓你知道還有這些：

- 到 Neon 的 Roles 頁面 reset `neondb_owner` 密碼（那串我在別的地方貼過），
  再更新 Vercel 的環境變數
- 填兩個人的 `players.discord_id`
- 兩人各開一次專屬網址

---

## 溝通方式

- 有疑問就問，不要猜。特別是「不要動的地方」那節提到的東西。
- 改動請小步進行，每步說明理由。
- 如果你覺得某個設計決定是錯的，講出來討論，但不要直接改掉。
