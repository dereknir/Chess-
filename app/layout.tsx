import type { Metadata } from 'next';
import { currentPlayer } from '@/lib/auth';
import './globals.css';

// 這裡曾經用 next/font/google 載 Noto Serif TC，拿掉了，原因兩個：
//   1. 它產生的 CSS 變數 --font-serif 沒有任何地方用到 —— globals.css 的
//      --serif 是寫死字型名 "Noto Serif TC"，對不上 next/font 產生的 family。
//   2. subsets 只能給 'latin'，中文字根本沒在那個子集裡。
// 結果是白付一份 webfont 下載，中文照樣走 globals.css 的系統字型 fallback。
// 想要真正的中文 webfont 就得載 CJK 子集，那是好幾 MB，不值得。

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
    <html lang="zh-Hant">
      <body>
        <div className="shell">
          <header className="topbar">
            <h1 className="wordmark">自食棋力</h1>
            <nav>
              <a href="/">目前這盤</a>
              <a href="/history">歷史</a>
              {me && <span className="who">{me.display_name}</span>}
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
