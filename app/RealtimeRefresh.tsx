'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Pusher from 'pusher-js';

/**
 * 訂閱 Pusher 即時推播，對方下完棋或發訊息時立刻刷新頁面。
 *
 * 聊天事件放在這裡而不是 ChatBox：ChatBox 只在聊天分頁被選中時才掛載，
 * 訂閱在它身上的話，停在記譜分頁就收不到新訊息，未讀提示永遠不會亮。
 */
export default function RealtimeRefresh({
  gameId,
  enabled,
}: {
  gameId: number;
  enabled: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channel = pusher.subscribe('game-updates');

    if (enabled) {
      channel.bind('move', (data: { gameId: number }) => {
        // 只刷新自己這盤棋
        if (data.gameId === gameId) {
          console.log('[pusher] 對方下完了，刷新棋盤');
          router.refresh();
        }
      });
    }

    // 對局結束後仍然可以聊天，所以不受 enabled 限制
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
  }, [gameId, enabled, router]);

  return null; // 純邏輯，不渲染任何東西
}
