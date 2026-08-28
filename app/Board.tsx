'use client';

import { useState, useTransition } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, type Square } from 'chess.js';
import { playMove, resign, takeback } from './actions';

// react-chessboard v4 的 API。v5 改成單一 options prop，寫法完全不同 ——
// package.json 已鎖 ^4，升級前先回來看這個檔案。
type Props = {
  gameId: number;
  fen: string;
  myColor: 'w' | 'b';
  isMyTurn: boolean;
  plyCount: number;
  opponentName: string;
  myTakebacksLeft: number;
  lastMoveUci: string | null;
};

type PossibleMove = {
  to: Square;
  isCapture: boolean;
};

/** 從 FEN 計算雙方剩餘子數（不含王） */
function countPieces(fen: string): { white: number; black: number } {
  const position = fen.split(' ')[0]; // 只看棋盤部分
  let white = 0;
  let black = 0;

  for (const char of position) {
    if (char >= 'A' && char <= 'Z' && char !== 'K') white++; // 白方（不含王）
    if (char >= 'a' && char <= 'z' && char !== 'k') black++; // 黑方（不含王）
  }

  return { white, black };
}

export default function Board({
  gameId,
  fen,
  myColor,
  isMyTurn,
  plyCount,
  opponentName,
  myTakebacksLeft,
  lastMoveUci,
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

  function onTakeback() {
    if (!confirm('確定悔棋？（剩餘 ' + myTakebacksLeft + ' 次）')) return;
    startTransition(async () => {
      const res = await takeback(gameId);
      if (!res.ok) setError(res.message);
    });
  }

  /** 計算格子高亮樣式 */
  const customSquareStyles: Record<string, React.CSSProperties> = {};

  // 上一步高亮（起點 + 終點）
  if (lastMoveUci && lastMoveUci.length >= 4) {
    const from = lastMoveUci.substring(0, 2);
    const to = lastMoveUci.substring(2, 4);
    customSquareStyles[from] = {
      backgroundColor: 'rgba(255, 255, 100, 0.4)',
    };
    customSquareStyles[to] = {
      backgroundColor: 'rgba(255, 255, 100, 0.6)',
    };
  }

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

  // 計算雙方剩餘子數
  const pieces = countPieces(shown);
  const canTakeback = !isMyTurn && !pending && myTakebacksLeft > 0;

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

      <div className="game-info">
        <span>第 {plyCount} 步</span>
        <span>
          白 {pieces.white} 子 · 黑 {pieces.black} 子
        </span>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="replay">
        <button
          className="btn-ghost"
          onClick={onTakeback}
          disabled={!canTakeback}
          title={
            myTakebacksLeft > 0
              ? `悔棋（剩餘 ${myTakebacksLeft} 次）`
              : '悔棋次數已用完'
          }
        >
          悔棋 ({myTakebacksLeft})
        </button>
        <button className="btn-ghost" onClick={onResign} disabled={pending}>
          認輸
        </button>
      </div>
    </div>
  );
}
