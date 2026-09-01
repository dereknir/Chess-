'use client';

import { useEffect, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Square } from 'chess.js';
import type { Move, MoveAnalysis } from '@/lib/db';
import EvaluationBar from './EvaluationBar';

export default function Replay({
  initialFen,
  fens,
  orientation,
  currentPly,
  onPlyChange,
  moves,
  analysis,
}: {
  initialFen: string;
  fens: string[];
  orientation: 'white' | 'black';
  currentPly?: number;
  onPlyChange?: (ply: number) => void;
  moves?: Move[];
  analysis?: MoveAnalysis[];
}) {
  const frames = [initialFen, ...fens];
  const [internalPly, setInternalPly] = useState(frames.length - 1);

  // 使用外部控制或內部狀態
  const i = currentPly !== undefined ? currentPly : internalPly;

  const setI = (value: number | ((prev: number) => number)) => {
    const newValue = typeof value === 'function' ? value(i) : value;
    if (onPlyChange) {
      onPlyChange(newValue);
    } else {
      setInternalPly(value);
    }
  };

  // 方向鍵翻棋譜，比點按鈕順手很多
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        const newVal = Math.max(0, i - 1);
        onPlyChange ? onPlyChange(newVal) : setInternalPly(newVal);
      }
      if (e.key === 'ArrowRight') {
        const newVal = Math.min(frames.length - 1, i + 1);
        onPlyChange ? onPlyChange(newVal) : setInternalPly(newVal);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frames.length, i, onPlyChange]);

  // 計算格子高亮樣式和箭頭
  const customSquareStyles: Record<string, React.CSSProperties> = {};
  const customArrows: [Square, Square, string][] = [];

  // 如果有走法資料，標記當前走法的品質
  if (i > 0 && moves && moves.length >= i) {
    const currentMove = moves[i - 1]; // moves 是從 ply 1 開始
    const currentAnalysis = analysis?.find(a => a.ply === currentMove.ply);

    if (currentMove.uci && currentMove.uci.length >= 4) {
      const from = currentMove.uci.substring(0, 2);
      const to = currentMove.uci.substring(2, 4);

      // 根據分析品質決定顏色
      let color = 'rgba(255, 255, 100, 0.5)'; // 預設黃色（無分析）

      if (currentAnalysis?.classification) {
        switch (currentAnalysis.classification) {
          case 'best':
            color = 'rgba(111, 179, 111, 0.6)'; // 綠色
            break;
          case 'good':
            color = 'rgba(201, 162, 39, 0.6)'; // 黃色
            break;
          case 'inaccuracy':
            color = 'rgba(214, 122, 63, 0.6)'; // 橘色
            break;
          case 'mistake':
            color = 'rgba(214, 122, 63, 0.7)'; // 深橘色
            break;
          case 'blunder':
            color = 'rgba(196, 85, 61, 0.8)'; // 紅色
            break;
        }
      }

      customSquareStyles[from] = {
        backgroundColor: color,
        boxShadow: `inset 0 0 0 3px ${color}`,
      };
      customSquareStyles[to] = {
        backgroundColor: color,
        boxShadow: `inset 0 0 0 3px ${color}`,
      };

      // 如果是臭棋，顯示建議走法的箭頭
      if (currentAnalysis &&
          currentAnalysis.best_move &&
          currentAnalysis.best_move.length >= 4 &&
          currentAnalysis.classification &&
          ['inaccuracy', 'mistake', 'blunder'].includes(currentAnalysis.classification)) {
        const bestFrom = currentAnalysis.best_move.substring(0, 2) as Square;
        const bestTo = currentAnalysis.best_move.substring(2, 4) as Square;

        // 綠色箭頭指向最佳走法
        customArrows.push([bestFrom, bestTo, 'rgb(111, 179, 111)']);

        // 紅色箭頭顯示實際走法（可選）
        // customArrows.push([from as Square, to as Square, 'rgb(196, 85, 61)']);
      }
    }
  }

  // 找到當前 ply 的分析資料
  const currentAnalysisForBar = i > 0 && analysis
    ? analysis.find(a => a.ply === i) || null
    : null;

  return (
    <div className="board-wrap">
      <div className="board-with-eval">
        <EvaluationBar analysis={currentAnalysisForBar} />
        <div className="board-frame">
          <Chessboard
            position={frames[i]}
            arePiecesDraggable={false}
            boardOrientation={orientation}
            customDarkSquareStyle={{ backgroundColor: '#6b7a94' }}
            customLightSquareStyle={{ backgroundColor: '#d9dce3' }}
            customSquareStyles={customSquareStyles}
            customArrows={customArrows}
          />
        </div>
      </div>

      <div className="replay">
        <button className="btn-ghost" onClick={() => setI(0)}>
          ⇤
        </button>
        <button
          className="btn-ghost"
          onClick={() => setI((n) => Math.max(0, n - 1))}
        >
          ←
        </button>
        <button
          className="btn-ghost"
          onClick={() => setI((n) => Math.min(frames.length - 1, n + 1))}
        >
          →
        </button>
        <button className="btn-ghost" onClick={() => setI(frames.length - 1)}>
          ⇥
        </button>
        <span className="ply">
          {i} / {frames.length - 1}
        </span>
      </div>
    </div>
  );
}
