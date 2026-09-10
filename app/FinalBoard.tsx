'use client';

import { Chessboard } from 'react-chessboard';
import type { BoardTheme } from '@/lib/themes';

/**
 * 結束後的盤面：只看，不能動。
 * Board 有認輸／提和／悔棋那一整排，局都結束了不該再出現；
 * Replay 又帶著評估條和翻頁鍵，那些留給複盤頁。
 */
export default function FinalBoard({
  fen,
  orientation,
  lastMoveUci,
  theme,
}: {
  fen: string;
  orientation: 'white' | 'black';
  lastMoveUci: string | null;
  theme: BoardTheme;
}) {
  const customSquareStyles: Record<string, React.CSSProperties> = {};
  if (lastMoveUci && lastMoveUci.length >= 4) {
    customSquareStyles[lastMoveUci.slice(0, 2)] = { backgroundColor: 'rgba(255, 255, 100, 0.4)' };
    customSquareStyles[lastMoveUci.slice(2, 4)] = { backgroundColor: 'rgba(255, 255, 100, 0.6)' };
  }

  return (
    <div className="board-wrap">
      <div className="board-frame">
        <Chessboard
          position={fen}
          boardOrientation={orientation}
          arePiecesDraggable={false}
          customDarkSquareStyle={{ backgroundColor: theme.darkSquare }}
          customLightSquareStyle={{ backgroundColor: theme.lightSquare }}
          customSquareStyles={customSquareStyles}
        />
      </div>
    </div>
  );
}
