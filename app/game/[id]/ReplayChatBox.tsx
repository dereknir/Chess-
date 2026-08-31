'use client';

import { type ChatMessage } from '@/lib/db';

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
  if (messages.length === 0) {
    return null; // 沒訊息就不顯示
  }

  return (
    <div className="chat-box">
      <h3 className="chat-title">對局聊天記錄</h3>

      <div className="chat-messages">
        {messages.map((msg) => {
          const isMe = msg.player_id === myId;
          const plyLabel = formatPly(msg.ply, finalPlyCount);
          const canJump = msg.ply !== null && msg.ply > 0;

          return (
            <div
              key={msg.id}
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
