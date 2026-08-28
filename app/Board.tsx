'use client';

import { useState, useTransition } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, type Square } from 'chess.js';
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

type PossibleMove = {
  to: Square;
  isCapture: boolean;
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

  // 落點提示：記錄選中的格子與可下的位置
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<PossibleMove[]>([]);

  const shown = optimisticFen ?? fen;
  const canMove = isMyTurn && !pending;

  /** 執行走子（由點選或拖放觸發） */
  function executeMove(from: string, to: string) {
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
    // 走完清掉選取狀態
    setSelectedSquare(null);
    setPossibleMoves([]);

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

  function onDrop(from: string, to: string) {
    if (!canMove) return false;
    return executeMove(from, to);
  }

  /** 點選格子：選中己方棋子、走到落點、或取消選取 */
  function onSquareClick(square: Square) {
    if (!canMove) return;

    const local = new Chess(fen);
    const piece = local.get(square);

    // 已有選取：點的是落點 → 走子
    if (selectedSquare && possibleMoves.some((m) => m.to === square)) {
      executeMove(selectedSquare, square);
      return;
    }

    // 點到己方棋子 → 選中它，算出落點
    if (piece && piece.color === myColor) {
      const moves = local.moves({ square, verbose: true });
      setSelectedSquare(square);
      setPossibleMoves(
        moves.map((m) => ({
          to: m.to as Square,
          isCapture: m.captured !== undefined,
        }))
      );
      return;
    }

    // 其他情況 → 取消選取
    setSelectedSquare(null);
    setPossibleMoves([]);
  }

  function onResign() {
    if (!confirm('確定認輸？')) return;
    startTransition(async () => {
      const res = await resign(gameId);
      if (!res.ok) setError(res.message);
    });
  }

  /** 計算格子高亮樣式 */
  const customSquareStyles: Record<string, React.CSSProperties> = {};

  // 選中的格子加底色
  if (selectedSquare) {
    customSquareStyles[selectedSquare] = {
      backgroundColor: 'rgba(255, 255, 0, 0.5)',
    };
  }

  // 可下的落點加圓點/圓環
  for (const move of possibleMoves) {
    if (move.isCapture) {
      // 吃子 → 紅色圓環
      customSquareStyles[move.to] = {
        background:
          'radial-gradient(circle, transparent 0%, transparent 65%, rgba(255, 70, 70, 0.8) 65%, rgba(255, 70, 70, 0.8) 80%, transparent 80%)',
      };
    } else {
      // 普通走法 → 綠色圓點
      customSquareStyles[move.to] = {
        background:
          'radial-gradient(circle, rgba(0, 128, 0, 0.4) 25%, transparent 25%)',
        borderRadius: '50%',
      };
    }
  }

  return (
    <div className="board-wrap">
      <div className="board-frame">
        <Chessboard
          position={shown}
          onPieceDrop={onDrop}
          onSquareClick={onSquareClick}
          boardOrientation={myColor === 'w' ? 'white' : 'black'}
          arePiecesDraggable={canMove}
          customDarkSquareStyle={{ backgroundColor: '#6b7a94' }}
          customLightSquareStyle={{ backgroundColor: '#d9dce3' }}
          customSquareStyles={customSquareStyles}
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
