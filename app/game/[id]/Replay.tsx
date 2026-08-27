'use client';

import { useEffect, useState } from 'react';
import { Chessboard } from 'react-chessboard';

export default function Replay({
  initialFen,
  fens,
  orientation,
}: {
  initialFen: string;
  fens: string[];
  orientation: 'white' | 'black';
}) {
  const frames = [initialFen, ...fens];
  const [i, setI] = useState(frames.length - 1);

  // 方向鍵翻棋譜，比點按鈕順手很多
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
      if (e.key === 'ArrowRight')
        setI((n) => Math.min(frames.length - 1, n + 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frames.length]);

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
