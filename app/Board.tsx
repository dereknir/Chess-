'use client';

import { useState, useTransition } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { playMove, resign } from './actions';

// react-chessboard v4 的 API。v5 改成單一 options prop，寫法完全不同 ——
// package.json 已鎖 ^4，升級前先回來看這個檔案。
type Props = {
  gameId: number;
  fen: string;
  myColor: 'w' | 'b';
  isMyTurn: boolean;
  plyCount: number;
  opponentName: string;
};

export default function Board({
  gameId,
  fen,
  myColor,
  isMyTurn,
  plyCount,
  opponentName,
}: Props) {
  // 樂觀更新：棋子先動，server 拒絕才彈回去。
  const [optimisticFen, setOptimisticFen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = optimisticFen ?? fen;
  const canMove = isMyTurn && !pending;

  function onDrop(from: string, to: string) {
    if (!canMove) return false;

    // 本地先驗一次，明顯不合法的走法連請求都不用發出去。
    const local = new Chess(fen);
    let promotion: 'q' | undefined;
    try {
      const m = local.move({ from, to, promotion: 'q' });
      promotion = m.promotion ? 'q' : undefined;
    } catch {
      return false;
    }

    setError(null);
    setOptimisticFen(local.fen());

    startTransition(async () => {
      const res = await playMove({
        gameId,
        from,
        to,
        promotion,
        expectedPly: plyCount,
      });
      // 成功或失敗都把樂觀狀態丟掉：成功的話 revalidate 已經送回新的 fen。
      setOptimisticFen(null);
      if (!res.ok) setError(res.message);
    });

    return true;
  }

  function onResign() {
    if (!confirm('確定認輸？')) return;
    startTransition(async () => {
      const res = await resign(gameId);
      if (!res.ok) setError(res.message);
    });
  }

  return (
    <div className="board-wrap">
      <div className="board-frame">
        <Chessboard
          position={shown}
          onPieceDrop={onDrop}
          boardOrientation={myColor === 'w' ? 'white' : 'black'}
          arePiecesDraggable={canMove}
          customDarkSquareStyle={{ backgroundColor: '#6b7a94' }}
          customLightSquareStyle={{ backgroundColor: '#d9dce3' }}
        />
      </div>

      <p className="status" data-mine={isMyTurn} role="status">
        <span className="dot" />
        {isMyTurn ? '輪到你了' : `等 ${opponentName} 落子`}
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="replay">
        <button className="btn-ghost" onClick={onResign} disabled={pending}>
          認輸
        </button>
      </div>
    </div>
  );
}
