'use client';

import { useState } from 'react';
import type { MoveAnalysis, Move } from '@/lib/db';

type Props = {
  analysis: MoveAnalysis[];
  moves: Move[];
  initialFen: string;
  /** 使用者的顏色，用於決定圖表視角 */
  userColor?: 'white' | 'black';
};

/**
 * 評估走勢圖
 *
 * 顯示整局的評估變化，X 軸是回合數，Y 軸是評分。
 * 從使用者視角顯示：使用者優勢往上，對手優勢往下。
 */
export default function EvaluationGraph({ analysis, moves, initialFen, userColor = 'white' }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (analysis.length === 0) return null;

  // 建立 ply -> move 的映射，用於判斷是誰走的這一步
  const moveMap = new Map<number, Move>();
  moves.forEach(m => moveMap.set(m.ply, m));

  const width = 720;
  const height = 300;
  const padding = { top: 10, right: 20, bottom: 20, left: 35 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // 評分範圍限制在 -500 到 +500 centipawns (-5 到 +5 pawns)
  const maxCp = 500;
  const minCp = -500;

  // 將 CP 值轉換為勝率（0-100），使用 Lichess 的公式
  function cpToWinRate(cp: number): number {
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  }

  // 將評分轉換為 Y 座標
  function cpToY(cp: number | null, mateIn: number | null): number {
    let winRate = 50; // 預設均勢

    if (mateIn !== null) {
      // 將死視為 100% 或 0%
      winRate = mateIn > 0 ? 100 : 0;
    } else if (cp !== null) {
      winRate = cpToWinRate(cp);
    }

    // 限制範圍 0-100
    winRate = Math.max(0, Math.min(100, winRate));

    // 映射到 Y 座標（反轉，因為 SVG 的 Y 軸向下）
    // winRate 100 (必勝) -> Y = padding.top
    // winRate 0 (必輸) -> Y = padding.top + chartHeight
    const ratio = winRate / 100;
    return padding.top + chartHeight * (1 - ratio);
  }

  // 將 ply 轉換為 X 座標
  function plyToX(ply: number): number {
    const maxPly = analysis[analysis.length - 1].ply;
    const ratio = (ply - 1) / Math.max(1, maxPly - 1);
    return padding.left + chartWidth * ratio;
  }

  // 格式化評估值顯示
  function formatEval(cp: number | null, mateIn: number | null): string {
    if (mateIn !== null) {
      return mateIn > 0 ? `+M${mateIn}` : `M${mateIn}`;
    }
    if (cp !== null) {
      const pawn = (cp / 100).toFixed(1);
      return cp >= 0 ? `+${pawn}` : pawn;
    }
    return '0.0';
  }

  // 生成折線路徑
  const points = analysis.map((a, idx) => {
    let cpFinal = a.cp;
    let mateFinal = a.mate_in;

    // Lichess Cloud Eval API 回傳的評估值（CP 和 Mate）都是從「輪到走的那方」視角
    const move = moveMap.get(a.ply);
    let needFlip = false;

    if (move) {
      const turnAfter = move.fen_after.split(' ')[1];
      // 步驟1: 統一轉成白方視角
      if (turnAfter === 'b') {
        needFlip = true;
        if (cpFinal !== null) cpFinal = -cpFinal;
        if (mateFinal !== null) mateFinal = -mateFinal;
      }
    }

    // 步驟2: 如果用戶執黑，再翻轉成黑方視角
    if (userColor === 'black') {
      if (cpFinal !== null) cpFinal = -cpFinal;
      if (mateFinal !== null) mateFinal = -mateFinal;
    }

    return {
      ply: a.ply,
      san: move?.san || '',
      x: plyToX(a.ply),
      y: cpToY(cpFinal, mateFinal),
      cpFinal,
      mateFinal,
    };
  });

  const pathData = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  // 中線（均勢線）
  const midY = cpToY(0, null);

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  return (
    <div className="eval-graph" style={{ position: 'relative' }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {/* 背景區域 - 使用者優勢 */}
        <rect
          x={padding.left}
          y={padding.top}
          width={chartWidth}
          height={(midY - padding.top)}
          fill="rgba(255, 255, 255, 0.03)"
        />

        {/* 背景區域 - 對手優勢 */}
        <rect
          x={padding.left}
          y={midY}
          width={chartWidth}
          height={(padding.top + chartHeight) - midY}
          fill="rgba(0, 0, 0, 0.15)"
        />

        {/* 均勢線 */}
        <line
          x1={padding.left}
          y1={midY}
          x2={width - padding.right}
          y2={midY}
          stroke="var(--rule)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* Y 軸刻度標籤 */}
        <text
          x={padding.left - 8}
          y={padding.top + 5}
          textAnchor="end"
          fill="var(--dim)"
          fontSize="10"
          fontFamily="var(--mono)"
        >
          +5
        </text>
        <text
          x={padding.left - 8}
          y={midY + 4}
          textAnchor="end"
          fill="var(--dim)"
          fontSize="10"
          fontFamily="var(--mono)"
        >
          0
        </text>
        <text
          x={padding.left - 8}
          y={height - padding.bottom + 5}
          textAnchor="end"
          fill="var(--dim)"
          fontSize="10"
          fontFamily="var(--mono)"
        >
          -5
        </text>

        {/* 評估折線 */}
        <path
          d={pathData}
          fill="none"
          stroke="var(--brass)"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* 各個評估點 */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoveredIndex === i ? "4" : "2.5"}
            fill="var(--brass)"
            opacity={hoveredIndex === i ? "1" : "0.6"}
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHoveredIndex(i)}
          />
        ))}

        {/* Hover 高亮線 */}
        {hoveredPoint && (
          <line
            x1={hoveredPoint.x}
            y1={padding.top}
            x2={hoveredPoint.x}
            y2={height - padding.bottom}
            stroke="var(--brass)"
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity="0.5"
          />
        )}
      </svg>

      {/* Tooltip */}
      {hoveredPoint && (
        <div
          style={{
            position: 'absolute',
            left: `${(hoveredPoint.x / width) * 100}%`,
            top: `${hoveredPoint.y}px`,
            transform: 'translate(-50%, -120%)',
            background: 'var(--bg-overlay)',
            border: '1px solid var(--rule)',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            fontFamily: 'var(--mono)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 'bold' }}>
            {hoveredPoint.ply}. {hoveredPoint.san}
          </div>
          <div style={{ color: 'var(--dim)' }}>
            {formatEval(hoveredPoint.cpFinal, hoveredPoint.mateFinal)}
          </div>
        </div>
      )}
    </div>
  );
}
