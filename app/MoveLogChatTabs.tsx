'use client';

import { useState, useEffect, type ReactNode } from 'react';

type Props = {
  moveLogContent: ReactNode;
  chatContent: ReactNode;
  /** 目前已知的訊息總數。有給才會顯示未讀提示（replay 頁不需要）。 */
  chatMessageCount?: number;
};

export default function MoveLogChatTabs({
  moveLogContent,
  chatContent,
  chatMessageCount,
}: Props) {
  const [activeTab, setActiveTab] = useState<'moves' | 'chat'>('moves');
  // 進頁面時既有的訊息一律視為已讀，否則每次重新整理都會亮紅點
  const [seenCount, setSeenCount] = useState(chatMessageCount ?? 0);

  const unread =
    chatMessageCount === undefined
      ? 0
      : Math.max(0, chatMessageCount - seenCount);

  // 切到聊天分頁（或在分頁上收到新訊息）就當作看過了
  useEffect(() => {
    if (activeTab === 'chat' && chatMessageCount !== undefined) {
      setSeenCount(chatMessageCount);
    }
  }, [activeTab, chatMessageCount]);

  return (
    <div className="move-chat-tabs">
      <div className="tab-buttons">
        <button
          className={`tab-button ${activeTab === 'moves' ? 'tab-button-active' : ''}`}
          onClick={() => setActiveTab('moves')}
        >
          記譜
        </button>
        <button
          className={`tab-button ${activeTab === 'chat' ? 'tab-button-active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          聊天
          {unread > 0 && (
            <span className="tab-badge">{unread > 9 ? '9+' : unread}</span>
          )}
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'moves' ? moveLogContent : chatContent}
      </div>
    </div>
  );
}
