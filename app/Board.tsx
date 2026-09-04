'use client';

import { useEffect, useState, useTransition } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, type Square } from 'chess.js';
import { playMove, resign, takeback, offerDraw, respondToDraw } from './actions';
import type { BoardTheme } from '@/lib/themes';

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
  pendingDrawOfferBy: string | null;
  myId: string;
  theme: BoardTheme;
};

type PossibleMove = {
  to: Square;
  isCapture: boolean;
};

/**
 * 主要指標裝置是否為觸控（手機、平板）。
 * 用 pointer: coarse 而非螢幕寬度 —— 電腦視窗縮到手機寬度時主指標仍是滑鼠，
 * 這樣就能只在真正的觸控裝置上關掉拖曳，避免滑動誤觸。
 */
function useCoarsePointer(): boolean {
  // SSR 與 hydration 前一律當成滑鼠，掛載後才修正，避免 hydration 不一致。
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setCoarse(mq.matches);

    const onChange = (e: MediaQueryListEvent) => setCoarse(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return coarse;
}

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
  pendingDrawOfferBy,
  myId,
  theme,
}: Props) {
  // 樂觀更新：棋子先動，server 拒絕才彈回去。
  const [optimisticFen, setOptimisticFen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 落點提示：記錄選中的格子與可下的位置
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<PossibleMove[]>([]);

  // 升變選單：等待用戶選擇升變子種
  const [promotionMove, setPromotionMove] = useState<{
    from: string;
    to: string;
  } | null>(null);

  // 觸控裝置只留點擊走子，拖曳容易誤滑。
  const isTouchDevice = useCoarsePointer();

  const shown = optimisticFen ?? fen;
  const canMove = isMyTurn && !pending;
  const canDrag = canMove && !isTouchDevice;

  /** 偵測是否為升變走法 */
  function isPromotionMove(from: string, to: string): boolean {
    const local = new Chess(fen);
    const piece = local.get(from as Square);
    if (!piece || piece.type !== 'p') return false;

    const toRank = to[1];
    return toRank === '1' || toRank === '8';
  }

  /** 執行走子（可指定升變子種） */
  function executeMove(
    from: string,
    to: string,
    promotionPiece?: 'q' | 'r' | 'b' | 'n'
  ) {
    // 如果是升變且沒指定子種 → 先顯示選單
    if (!promotionPiece && isPromotionMove(from, to)) {
      setPromotionMove({ from, to });
      setSelectedSquare(null);
      setPossibleMoves([]);
      return true;
    }

    // 本地先驗一次，明顯不合法的走法連請求都不用發出去。
    const local = new Chess(fen);
    let promotion: 'q' | 'r' | 'b' | 'n' | undefined;
    try {
      const m = local.move({
        from,
        to,
        promotion: promotionPiece || 'q',
      });
      promotion = m.promotion ? (promotionPiece || 'q') : undefined;
    } catch {
      return false;
    }

    setError(null);
    setOptimisticFen(local.fen());
    setSelectedSquare(null);
    setPossibleMoves([]);
    setPromotionMove(null);

    startTransition(async () => {
      const res = await playMove({
        gameId,
        from,
        to,
        promotion,
        expectedPly: plyCount,
      });
      setOptimisticFen(null);
      if (!res.ok) setError(res.message);
    });

    return true;
  }

  function onDrop(from: string, to: string) {
    if (!canDrag) return false;
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

  function onOfferDraw() {
    if (!confirm('確定提出和棋？')) return;
    startTransition(async () => {
      const res = await offerDraw(gameId);
      if (!res.ok) setError(res.message);
    });
  }

  function onAcceptDraw() {
    if (!confirm('確定接受和棋？')) return;
    startTransition(async () => {
      const res = await respondToDraw(gameId, true);
      if (!res.ok) setError(res.message);
    });
  }

  function onDeclineDraw() {
    startTransition(async () => {
      const res = await respondToDraw(gameId, false);
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
          arePiecesDraggable={canDrag}
          customDarkSquareStyle={{ backgroundColor: theme.darkSquare }}
          customLightSquareStyle={{ backgroundColor: theme.lightSquare }}
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

      {/* 對方提和：顯示通知與回應按鈕 */}
      {pendingDrawOfferBy && pendingDrawOfferBy !== myId && (
        <div className="draw-notice">
          <p>
            <strong>{opponentName}</strong> 提出和棋
          </p>
          <div className="draw-actions">
            <button
              className="btn-ghost"
              onClick={onAcceptDraw}
              disabled={pending}
            >
              接受
            </button>
            <button
              className="btn-ghost"
              onClick={onDeclineDraw}
              disabled={pending}
            >
              拒絕
            </button>
          </div>
        </div>
      )}

      {/* 我方提和：顯示等待狀態 */}
      {pendingDrawOfferBy && pendingDrawOfferBy === myId && (
        <div className="draw-pending">
          <p>已提出和棋，等待 {opponentName} 回應</p>
        </div>
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
        <button
          className="btn-ghost"
          onClick={onOfferDraw}
          disabled={pending || pendingDrawOfferBy !== null}
          title={pendingDrawOfferBy ? '已有待處理的提和' : '提出和棋'}
        >
          提和
        </button>
        <button className="btn-ghost" onClick={onResign} disabled={pending}>
          認輸
        </button>
      </div>

      {promotionMove && (
        <div className="promotion-overlay">
          <div className="promotion-modal">
            <h3>選擇升變棋子</h3>
            <div className="promotion-choices">
              <button
                onClick={() =>
                  executeMove(promotionMove.from, promotionMove.to, 'q')
                }
              >
                {myColor === 'w' ? '♕' : '♛'}
                <span>皇后</span>
              </button>
              <button
                onClick={() =>
                  executeMove(promotionMove.from, promotionMove.to, 'r')
                }
              >
                {myColor === 'w' ? '♖' : '♜'}
                <span>城堡</span>
              </button>
              <button
                onClick={() =>
                  executeMove(promotionMove.from, promotionMove.to, 'b')
                }
              >
                {myColor === 'w' ? '♗' : '♝'}
                <span>主教</span>
              </button>
              <button
                onClick={() =>
                  executeMove(promotionMove.from, promotionMove.to, 'n')
                }
              >
                {myColor === 'w' ? '♘' : '♞'}
                <span>騎士</span>
              </button>
            </div>
            <button
              className="btn-ghost"
              onClick={() => setPromotionMove(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
