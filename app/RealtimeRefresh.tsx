'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Pusher from 'pusher-js';

/**
 * 訂閱 Pusher 即時推播，對方下完棋立刻刷新頁面
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
    if (!enabled) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channel = pusher.subscribe('game-updates');

    channel.bind('move', (data: { gameId: number }) => {
      // 只刷新自己這盤棋
      if (data.gameId === gameId) {
        console.log('[pusher] 對方下完了，刷新棋盤');
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
