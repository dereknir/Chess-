'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { sendChatMessage } from './actions';
import type { ChatMessage } from '@/lib/db';

type Props = {
  gameId: number;
  myId: string;
  opponentName: string;
  finalPlyCount: number | null; // 對局結束時的步數，ongoing 時為 null
  initialMessages: Array<{
    id: number;
    player_id: string;
    message: string;
    ply: number | null;
    created_at: Date;
  }>;
};

export default function ChatBox({
  gameId,
  myId,
  opponentName,
  finalPlyCount,
  initialMessages,
}: Props) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true); // 使用者目前是否停在底部
  const isFirstRender = useRef(true);

  // 只捲聊天容器本身。scrollIntoView 會把每一層祖先都捲到目標可見為止，
  // 手機上外層 document 也需要捲，於是整頁被拉到最底。
  useEffect(() => {
    const el = listRef.current;
    const first = isFirstRender.current;
    isFirstRender.current = false;

    // 使用者往上翻歷史訊息時不要把他拉回來
    if (!el || !stickToBottom.current) return;

    el.scrollTo({
      top: el.scrollHeight,
      behavior: first ? 'auto' : 'smooth', // 首次掛載直接就位，不要動畫
    });
  }, [initialMessages]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    // 留 40px 餘裕，觸控慣性不會讓它誤判成「已離開底部」
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  async function handleSend() {
    if (!message.trim()) return;

    setError(null);
    stickToBottom.current = true; // 自己發言一定要看到
    const msg = message;
    setMessage(''); // 立即清空輸入框（樂觀更新）

    startTransition(async () => {
      const res = await sendChatMessage(gameId, msg);
      if (!res.ok) {
        setError(res.message);
        setMessage(msg); // 失敗時恢復訊息
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat-box">
      <h3 className="chat-title">對局聊天</h3>

      <div className="chat-messages" ref={listRef} onScroll={handleScroll}>
        {initialMessages.length === 0 ? (
          <p className="chat-empty">還沒有訊息</p>
        ) : (
          initialMessages.map((msg) => {
            const isMe = msg.player_id === myId;
            return (
              <div
                key={msg.id}
                className={`chat-message ${isMe ? 'chat-message-me' : 'chat-message-opponent'}`}
              >
                <div className="chat-message-header">
                  <span className="chat-sender">
                    {isMe ? '我' : opponentName}
                  </span>
                  <span className="chat-ply">
                    {formatPly(msg.ply, finalPlyCount)}
                  </span>
                </div>
                <div className="chat-message-content">{msg.message}</div>
              </div>
            );
          })
        )}
      </div>

      <div className="chat-input-area">
        {error && <p className="chat-error">{error}</p>}
        <div className="chat-input-row">
          <input
            type="text"
            className="chat-input"
            placeholder="輸入訊息..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={pending}
            maxLength={500}
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={pending || !message.trim()}
          >
            {pending ? '送出中...' : '送出'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatPly(ply: number | null, finalPlyCount: number | null): string {
  if (ply === null || ply === 0) {
    return '局前';
  }
  // 對局已結束，且訊息是最後步數之後發的 → 局後
  if (finalPlyCount !== null && ply >= finalPlyCount) {
    return '局後';
  }
  return `第 ${Math.ceil(ply / 2)} 手`;
}