import { NextRequest, NextResponse } from 'next/server';
import { currentPlayer, rememberPlayer } from '@/lib/auth';

/**
 * 秘密網址登入的落點。
 *
 * Server Component 不允許寫 cookie(Next.js 限制),所以 page.tsx 看到
 * ?as=<token> 會 redirect 到這裡:這裡查 DB 驗證 token、寫 cookie、再導回首頁。
 * 對使用者來說入口仍然是 /?as=<token>,設計不變。
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('as');
  const home = new URL('/', req.nextUrl.origin);

  if (token) {
    const found = await currentPlayer(token);
    if (found) await rememberPlayer(token);
  }

  return NextResponse.redirect(home);
}
