import Pusher from 'pusher';

/**
 * Pusher 後端實例（Server Actions 用）
 *
 * 用途：對方下完棋 → 推播事件 → 你的頁面立刻刷新
 */
export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});
