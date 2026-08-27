import type { Metadata } from 'next';
import { Noto_Serif_TC } from 'next/font/google';
import { currentPlayer } from '@/lib/auth';
import './globals.css';

const serif = Noto_Serif_TC({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-serif',
  display: 'swap',
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
    <html lang="zh-Hant" className={serif.variable}>
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
