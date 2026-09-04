import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import { currentPlayer } from '@/lib/auth';
import './globals.css';

// 英數走 Google Fonts 的 DM Sans；中文沒有跟著載 —— CJK 全字集好幾 MB，
// 不值得，所以中文仍由 globals.css 的 --sans fallback 交給 PingFang /
// Noto Sans TC。
// 關鍵是 next/font 產生的 family 要透過 CSS 變數接進 --sans，不能在 CSS 裡
// 寫死字型名（之前載 Noto Serif TC 那次就是漏了這一步，等於白載一份 webfont）。
const sans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: '自食棋力',
  description: '我要成為西洋棋大師!',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await currentPlayer();

  return (
    <html lang="zh-Hant" className={sans.variable}>
      <body>
        <div className="shell">
          <header className="topbar">
            <h1 className="wordmark">
              {/* alt 留空：這是裝飾，站名的意思由旁邊的字負責 */}
              <img src="/rose.png" alt="" className="mark" width={39} height={34} />
              自食棋力
            </h1>
            <nav>
              <a href="/">目前這盤</a>
              <a href="/history">歷史</a>
              <a href="/stats">統計</a>
              {me && <span className="who">{me.display_name}</span>}
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
