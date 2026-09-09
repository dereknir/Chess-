const WEBHOOK = process.env.DISCORD_WEBHOOK_URL!;
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

const ACCENT = 0x3d63ff;
const GOLD = 0xe8c94a;
const CHAT = 0x808da6;   // 比落子通知低調：聊天不是輪到你了

type Embed = {
  title: string;
  description: string;
  url: string;
  color: number;
  image?: { url: string };
  footer?: { text: string };
};

/**
 * 真正打 webhook 的地方，三種通知共用。
 *
 * 用 webhook 而不是 bot：不用 token、不用長駐連線、不用處理 interaction 簽章。
 * 就是一條 URL POST 過去。
 */
async function post(opponentDiscordId: string | null, lead: string, embed: Embed) {
  if (!WEBHOOK) return; // 本機開發沒設就安靜跳過

  const mention = opponentDiscordId ? `<@${opponentDiscordId}>` : '';

  await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // mention 是刻意的：只發訊息到頻道，對方靜音就收不到推播。
      content: mention ? `${mention} ${lead}` : lead,
      allowed_mentions: {
        parse: [],                                          // 擋掉 @everyone
        users: opponentDiscordId ? [opponentDiscordId] : [],
      },
      embeds: [embed],
    }),
  }).catch((err) => {
    // 通知失敗不該讓原本的動作失敗，記下來就好。
    console.error('[discord] 推播失敗', err);
  });
}

/**
 * 通知要把人帶去哪。
 * 還沒結束就指首頁 —— /game/<id> 是唯讀的複盤頁，落不了子也回不了話。
 * 局結束了才指複盤頁，那正是要去看的地方。
 */
function linkFor(gameId: number, ended: boolean) {
  return ended ? `${APP_URL}/game/${gameId}` : APP_URL;
}

// ---------- 落子 ----------

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

/** 對方落子後推播。 */
export async function notifyMove(n: MoveNotice) {
  const moveNo = Math.ceil(n.ply / 2);
  const img = boardImageUrl(n.fen, n.uci);

  await post(n.opponentDiscordId, n.ending ? '這局結束了' : '輪到你了', {
    title: n.ending
      ? n.ending.headline
      : `第 ${moveNo} 手　${n.san}${n.isCheck ? '　將軍' : ''}`,
    description: n.ending ? n.ending.detail : `${n.moverName} 已落子`,
    url: linkFor(n.gameId, Boolean(n.ending)),
    color: n.ending ? GOLD : ACCENT,
    ...(img ? { image: { url: img } } : {}),
    footer: { text: n.fen },
  });
}

// ---------- 認輸、提和、悔棋 ----------

type EventNotice = {
  opponentDiscordId: string | null;
  gameId: number;
  /** content 那行，接在 mention 後面：「這局結束了」「對方提和，等你回應」 */
  lead: string;
  title: string;
  detail: string;
  /** 這局是否已經結束 —— 決定顏色與連結要指去哪 */
  ended: boolean;
};

/**
 * 落子以外會改變局面的事。
 * 沒有棋盤圖 —— 盤面沒變（悔棋除外，但那一步對方點進去就看得到）。
 */
export async function notifyEvent(n: EventNotice) {
  await post(n.opponentDiscordId, n.lead, {
    title: n.title,
    description: n.detail,
    url: linkFor(n.gameId, n.ended),
    color: n.ended ? GOLD : ACCENT,
  });
}

// ---------- 聊天 ----------

type ChatNotice = {
  opponentDiscordId: string | null;
  senderName: string;
  gameId: number;
  message: string;
  /** 訊息是在第幾 ply 發的，null 代表局前 */
  ply: number | null;
  /** 這局是否已經結束 —— 決定標籤與連結要指去哪 */
  ended: boolean;
  /** 回覆的是哪一則 */
  replyTo?: { senderName: string; message: string };
};

/**
 * 對方發訊息後推播。
 * 每一則都 mention —— 只有兩個人在用，寧可吵一點也不要漏掉。
 */
export async function notifyChat(n: ChatNotice) {
  // Discord 的 embed 描述吃 markdown，> 就是引用框
  const quote = n.replyTo
    ? `> **${n.replyTo.senderName}**　${oneLine(n.replyTo.message)}\n`
    : '';

  await post(n.opponentDiscordId, '有新訊息', {
    title: `${n.senderName}　${n.ended ? '局後' : plyLabel(n.ply)}`,
    description: quote + n.message,
    url: linkFor(n.gameId, n.ended),
    color: CHAT,
  });
}

function plyLabel(ply: number | null): string {
  if (ply === null || ply === 0) return '局前';
  return `第 ${Math.ceil(ply / 2)} 手`;
}

/** 引用只留一行，太長就截 */
function oneLine(s: string): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}

// ---------- 棋盤圖 ----------

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
