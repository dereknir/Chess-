'use client';

import { useEffect, useState } from 'react';
import { Chessboard } from 'react-chessboard';

export default function Replay({
  initialFen,
  fens,
  orientation,
  currentPly,
  onPlyChange,
}: {
  initialFen: string;
  fens: string[];
  orientation: 'white' | 'black';
  currentPly?: number;
  onPlyChange?: (ply: number) => void;
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

  return (
    <div className="board-wrap">
      <div className="board-frame">
        <Chessboard
          position={frames[i]}
          arePiecesDraggable={false}
          boardOrientation={orientation}
          customDarkSquareStyle={{ backgroundColor: '#6b7a94' }}
          customLightSquareStyle={{ backgroundColor: '#d9dce3' }}
        />
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
