'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { sendChatMessage } from './actions';
import { ChatQuote, jumpToMessage } from './ChatQuote';
import type { ChatMessage } from '@/lib/db';

type Props = {
  gameId: number;
  myId: string;
  opponentName: string;
  finalPlyCount: number | null; // 對局結束時的步數，ongoing 時為 null
  initialMessages: ChatMessage[];
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
  // 正在回覆哪一則；null 就是普通發言
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true); // 使用者目前是否停在底部
  const isFirstRender = useRef(true);
  const sending = useRef(false); // 送出中，擋連按

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

  function handleSend() {
    const msg = message;
    const target = replyTo;
    // pending 是 state，要等重新 render 才會變 true。連按兩次 Enter 時，
    // 第二次的 handler 可能還讀到舊的 message 和舊的 pending，就送出兩則。
    // ref 是同步的，所以擋得住。
    if (sending.current || !msg.trim()) return;

    sending.current = true;
    setError(null);
    stickToBottom.current = true; // 自己發言一定要看到
    setMessage(''); // 立即清空輸入框（樂觀更新）
    setReplyTo(null);

    startTransition(async () => {
      try {
        const res = await sendChatMessage(gameId, msg, target?.id ?? null);
        if (!res.ok) {
          setError(res.message);
          setMessage(msg); // 失敗時恢復訊息
          setReplyTo(target);
        }
      } catch {
        // 連 server action 都沒回來（斷線、cookie 失效）：
        // 不接的話會炸到 error boundary，整個聊天框變成錯誤畫面
        setError('發送訊息失敗，再試一次。');
        setMessage(msg);
        setReplyTo(target);
      } finally {
        sending.current = false;
      }
    });
  }

  function startReply(msg: ChatMessage) {
    setReplyTo(msg);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // 中文輸入法組字中的 Enter 是拿來確認候選字的，不是送出。
    // 不擋的話「你好」的 Enter 會連字一起送出去。
    // keyCode 229 是 Safari 的補充：它有時在 keydown 之前就結束組字，
    // 這時 isComposing 已經是 false。
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && replyTo) {
      setReplyTo(null);
    }
  }

  // 引用框要顯示原訊息的內容，用 id 找
  const byId = new Map(initialMessages.map((m) => [m.id, m]));
  const nameOf = (m: ChatMessage) => (m.player_id === myId ? '我' : opponentName);

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
                data-message-id={msg.id}
                className={`chat-message ${isMe ? 'chat-message-me' : 'chat-message-opponent'}`}
              >
                <div className="chat-message-header">
                  <span className="chat-sender">{nameOf(msg)}</span>
                  <span className="chat-message-meta">
                    <span className="chat-ply">
                      {formatPly(msg.ply, finalPlyCount)}
                    </span>
                    <button
                      type="button"
                      className="chat-reply-btn"
                      onClick={() => startReply(msg)}
                      disabled={pending}
                    >
                      回覆
                    </button>
                  </span>
                </div>
                {msg.reply_to !== null && (
                  <ChatQuote
                    original={byId.get(msg.reply_to) ?? null}
                    myId={myId}
                    opponentName={opponentName}
                    onJump={() => jumpToMessage(listRef.current, msg.reply_to!)}
                  />
                )}
                <div className="chat-message-content">{msg.message}</div>
              </div>
            );
          })
        )}
      </div>

      <div className="chat-input-area">
        {error && <p className="chat-error">{error}</p>}
        {replyTo && (
          <div className="chat-reply-bar">
            <span className="chat-reply-text">
              回覆 <b>{nameOf(replyTo)}</b>：{replyTo.message}
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="取消回覆"
              title="取消回覆（Esc）"
            >
              ×
            </button>
          </div>
        )}
        <div className="chat-input-row">
          <input
            ref={inputRef}
            type="text"
            className="chat-input"
            placeholder={replyTo ? '輸入回覆...' : '輸入訊息...'}
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