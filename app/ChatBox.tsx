'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Pusher from 'pusher-js';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // 自動滾動到最新訊息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [initialMessages]);

  // 監聽 Pusher 即時更新
  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channel = pusher.subscribe('game-updates');

    channel.bind('chat', (data: { gameId: number }) => {
      if (data.gameId === gameId) {
        console.log('[pusher] 收到新訊息，刷新聊天');
        router.refresh();
      }
    });

    return () => {
      channel.unbind_all();
      channel.unsubscribe();
      pusher.disconnect();
    };
  }, [gameId, router]);

  async function handleSend() {
    if (!message.trim()) return;

    setError(null);
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

      <div className="chat-messages">
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
        <div ref={messagesEndRef} />
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