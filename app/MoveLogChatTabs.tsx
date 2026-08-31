'use client';

import { useState, type ReactNode } from 'react';

type Props = {
  moveLogContent: ReactNode;
  chatContent: ReactNode;
};

export default function MoveLogChatTabs({ moveLogContent, chatContent }: Props) {
  const [activeTab, setActiveTab] = useState<'moves' | 'chat'>('moves');

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
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'moves' ? moveLogContent : chatContent}
      </div>
    </div>
  );
}
