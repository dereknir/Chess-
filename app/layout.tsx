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
  title: '通信對弈',
  description: '兩人一盤，一天走幾步。',
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
            <h1 className="wordmark">通信對弈</h1>
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
