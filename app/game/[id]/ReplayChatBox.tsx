'use client';

import { useRef } from 'react';
import { type ChatMessage } from '@/lib/db';
import { ChatQuote, jumpToMessage } from '../../ChatQuote';

type Props = {
  messages: ChatMessage[];
  myId: string;
  opponentName: string;
  finalPlyCount: number;
  onJumpToPly: (ply: number) => void;
};

export default function ReplayChatBox({
  messages,
  myId,
  opponentName,
  finalPlyCount,
  onJumpToPly,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  // key 一律轉字串：postgres.js 把 int8 回成字串、int4 回成數字，
  // id 與 reply_to 只要型別不一致 Map 就找不到。
  const byId = new Map(messages.map((m) => [String(m.id), m]));

  return (
    <div className="chat-box">
      <h3 className="chat-title">對局聊天記錄</h3>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          // 這個元件是分頁的內容，回傳 null 會讓分頁下面空一塊
          <p className="chat-empty">這局沒有聊天記錄</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.player_id === myId;
          const plyLabel = formatPly(msg.ply, finalPlyCount);
          const canJump = msg.ply !== null && msg.ply > 0;

          return (
            <div
              key={msg.id}
              data-message-id={msg.id}
              className={`chat-message ${isMe ? 'chat-message-me' : 'chat-message-opponent'} ${canJump ? 'chat-message-clickable' : ''}`}
              onClick={() => canJump && onJumpToPly(msg.ply!)}
              title={canJump ? `點擊跳到第 ${Math.ceil(msg.ply! / 2)} 手` : ''}
            >
              <div className="chat-message-header">
                <span className="chat-sender">
                  {isMe ? '我' : opponentName}
                </span>
                <span className="chat-ply">{plyLabel}</span>
              </div>
              {msg.reply_to !== null && (
                <ChatQuote
                  original={byId.get(String(msg.reply_to)) ?? null}
                  myId={myId}
                  opponentName={opponentName}
                  onJump={() => jumpToMessage(listRef.current, msg.reply_to!)}
                />
              )}
              <div className="chat-message-content">{msg.message}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatPly(ply: number | null, finalPlyCount: number): string {
  if (ply === null || ply === 0) {
    return '局前';
  }
  if (ply >= finalPlyCount) {
    return '局後';
  }
  return `第 ${Math.ceil(ply / 2)} 手`;
}
