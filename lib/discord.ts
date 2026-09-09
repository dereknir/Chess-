const WEBHOOK = process.env.DISCORD_WEBHOOK_URL!;
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

const ACCENT = 0x3d63ff;
const GOLD = 0xe8c94a;
const CHAT = 0x808da6;   // 比落子通知低調：聊天不是輪到你了

type MoveNotice = {
  opponentDiscordId: string | null;
  moverName: string;
  gameId: number;
  ply: number;
  san: string;
  fen: string;
  uci: string;
  isCheck: boolean;
  /** 有值代表這局結束了 */
  ending?: { headline: string; detail: string };
};

/**
 * 對方落子後推播。
 *
 * 用 webhook 而不是 bot：不用 token、不用長駐連線、不用處理 interaction 簽章。
 * 就是一條 URL POST 過去。
 */
export async function notifyMove(n: MoveNotice) {
  if (!WEBHOOK) return; // 本機開發沒設就安靜跳過

  const mention = n.opponentDiscordId ? `<@${n.opponentDiscordId}>` : '';
  const moveNo = Math.ceil(n.ply / 2);

  const img = boardImageUrl(n.fen, n.uci);

  const embed = {
    title: n.ending
      ? n.ending.headline
      : `第 ${moveNo} 手　${n.san}${n.isCheck ? '　將軍' : ''}`,
    description: n.ending ? n.ending.detail : `${n.moverName} 已落子`,
    // 還沒結束就指首頁 —— /game/<id> 是唯讀的複盤頁，落不了子。
    // 局結束了才指複盤頁，那正是要去看的地方。
    url: n.ending ? `${APP_URL}/game/${n.gameId}` : APP_URL,
    color: n.ending ? GOLD : ACCENT,
    ...(img ? { image: { url: img } } : {}),
    footer: { text: n.fen },
  };

  await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // mention 是刻意的：只發訊息到頻道，對方靜音就收不到推播。
      content: n.ending ? `${mention} 這局結束了` : `${mention} 輪到你了`,
      allowed_mentions: {
        parse: [],                                          // 擋掉 @everyone
        users: n.opponentDiscordId ? [n.opponentDiscordId] : [],
      },
      embeds: [embed],
    }),
  }).catch((err) => {
    // 通知失敗不該讓落子失敗，記下來就好。
    console.error('[discord] 推播失敗', err);
  });
}

type ChatNotice = {
  opponentDiscordId: string | null;
  senderName: string;
  gameId: number;
  message: string;
  /** 訊息是在第幾 ply 發的，null 代表局前 */
  ply: number | null;
  /** 這局是否已經結束 —— 決定標籤與連結要指去哪 */
  ended: boolean;
};

/**
 * 對方發訊息後推播。
 *
 * 跟 notifyMove 走同一條 webhook，只是換個顏色、不放棋盤圖。
 * 每一則都 mention —— 只有兩個人在用，寧可吵一點也不要漏掉。
 */
export async function notifyChat(n: ChatNotice) {
  if (!WEBHOOK) return; // 本機開發沒設就安靜跳過

  const mention = n.opponentDiscordId ? `<@${n.opponentDiscordId}>` : '';

  const embed = {
    title: `${n.senderName}　${n.ended ? '局後' : plyLabel(n.ply)}`,
    description: n.message,
    // 進行中的對局要進首頁才回得了話，/game/<id> 是唯讀的複盤頁
    url: n.ended ? `${APP_URL}/game/${n.gameId}` : APP_URL,
    color: CHAT,
  };

  await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: mention ? `${mention} 有新訊息` : '有新訊息',
      allowed_mentions: {
        parse: [],                                          // 擋掉 @everyone
        users: n.opponentDiscordId ? [n.opponentDiscordId] : [],
      },
      embeds: [embed],
    }),
  }).catch((err) => {
    // 通知失敗不該讓發訊息失敗，記下來就好。
    console.error('[discord] 聊天推播失敗', err);
  });
}

function plyLabel(ply: number | null): string {
  if (ply === null || ply === 0) return '局前';
  return `第 ${Math.ceil(ply / 2)} 手`;
}

/**
 * 棋盤圖網址。
 *
 * 預設用 chessvision.ai 的 fen2image —— 第三方服務，不用自己架，
 * 但等於把推播的圖片綁在別人身上。想自主的話有兩條路：
 *   1. 自架 lichess-org/lila-gif（Rust，丟 Fly.io 或 Railway），
 *      然後設 BOARD_IMAGE_BASE=https://你的網址/image.gif
 *   2. 完全不放圖 —— 設 BOARD_IMAGE=off，embed 只留 SAN 和連結。
 *      點進去就看得到棋盤，其實不太差。
 */
function boardImageUrl(fen: string, lastMove: string): string | null {
  if (process.env.BOARD_IMAGE === 'off') return null;

  const base = process.env.BOARD_IMAGE_BASE;
  if (base) {
    // lila-gif 的參數格式
    const p = new URLSearchParams({ fen, lastMove });
    return `${base}?${p}`;
  }

  // fen2image 把 FEN 放在路徑上，空白要編碼
  return `https://fen2image.chessvision.ai/${encodeURIComponent(fen)}`;
}
