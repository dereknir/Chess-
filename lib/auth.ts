import { cookies } from 'next/headers';
import sql, { type Player } from './db';

const COOKIE = 'player_token';
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * 認出現在是誰在操作。
 *
 * 流程：第一次用 ?as=<token> 的秘密網址進站 → 寫進 cookie → 之後直接進首頁就認得。
 * 只有兩個人在用，所以不做 session、不做過期、不做撤銷。
 * 真的要換人就去 players 表 update token。
 */
export async function currentPlayer(
  tokenFromUrl?: string,
): Promise<Player | null> {
  const jar = await cookies();
  const token = tokenFromUrl ?? jar.get(COOKIE)?.value;
  if (!token) return null;

  const [player] = await sql<Player[]>`
    select id, display_name, token, discord_id
    from players
    where token = ${token}
  `;
  return player ?? null;
}

/** 秘密網址進站後呼叫，把 token 記進 cookie。 */
export async function rememberPlayer(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ONE_YEAR,
    path: '/',
  });
}

export async function forgetPlayer() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Server Action 裡用：沒認出人就直接擋掉。 */
export async function requirePlayer(): Promise<Player> {
  const player = await currentPlayer();
  if (!player) throw new Error('這個連結沒有下棋權限，跟對方要一次專屬網址。');
  return player;
}
