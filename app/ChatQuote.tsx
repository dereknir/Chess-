'use client';

import type { ChatMessage } from '@/lib/db';

/**
 * 訊息上方的引用框：這則是在回覆哪一則。
 * 對局中的 ChatBox 和複盤的 ReplayChatBox 都用，長相要一致。
 */
export function ChatQuote({
  original,
  myId,
  opponentName,
  onJump,
}: {
  /** 被回覆的那則；找不到就給 null（理論上不會，訊息沒有刪除功能） */
  original: ChatMessage | null;
  myId: string;
  opponentName: string;
  onJump: () => void;
}) {
  if (!original) {
    return <div className="chat-quote chat-quote-missing">原訊息不存在</div>;
  }

  const who = original.player_id === myId ? '我' : opponentName;

  return (
    <button
      type="button"
      className="chat-quote"
      title="跳到原訊息"
      onClick={(e) => {
        // 複盤頁整則訊息本身可點（跳手數），別讓這一下也觸發那個
        e.stopPropagation();
        onJump();
      }}
    >
      <span className="chat-quote-sender">{who}</span>
      <span className="chat-quote-text">{original.message}</span>
    </button>
  );
}

/**
 * 把聊天列表捲到某一則訊息，並閃一下讓人看到是哪則。
 *
 * 只捲列表容器本身。scrollIntoView 會把每一層祖先都捲到目標可見為止，
 * 手機上外層 document 也需要捲，整頁就被拉走了。
 */
export function jumpToMessage(list: HTMLElement | null, id: number) {
  if (!list) return;
  const el = list.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
  if (!el) return;

  const top =
    el.getBoundingClientRect().top -
    list.getBoundingClientRect().top +
    list.scrollTop -
    12;
  list.scrollTo({ top, behavior: 'smooth' });

  el.classList.add('chat-message-flash');
  window.setTimeout(() => el.classList.remove('chat-message-flash'), 1200);
}
