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
  // 視窗在前景，而且回來之後有互動過。人不在的時候進來的訊息不算看過。
  const [engaged, setEngaged] = useState(true);

  useEffect(() => {
    const leave = () => setEngaged(false);
    const hide = () => {
      if (document.visibilityState === 'hidden') setEngaged(false);
    };
    const touch = () => setEngaged(true);

    // 兩個離開事件都要聽：切換應用程式只發 blur（分頁仍算 visible），
    // 切換瀏覽器分頁只發 visibilitychange。
    window.addEventListener('blur', leave);
    document.addEventListener('visibilitychange', hide);
    // 回到前景本身不算已讀，否則數字會在你看清楚之前就消失。
    // 要真的點一下或按鍵才算。
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);

    return () => {
      window.removeEventListener('blur', leave);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, []);

  const unread =
    chatMessageCount === undefined
      ? 0
      : Math.max(0, chatMessageCount - seenCount);

  // 人在、而且分頁是聊天，才算看過
  useEffect(() => {
    if (engaged && activeTab === 'chat' && chatMessageCount !== undefined) {
      setSeenCount(chatMessageCount);
    }
  }, [engaged, activeTab, chatMessageCount]);

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
