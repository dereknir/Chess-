import type { MoveAnalysis } from '@/lib/db';

type Props = {
  analysis: MoveAnalysis[];
};

/**
 * 評估走勢圖
 *
 * 顯示整局的評估變化，X 軸是回合數，Y 軸是評分。
 * 0 線在中間（均勢），上方是白方優勢，下方是黑方優勢。
 */
export default function EvaluationGraph({ analysis }: Props) {
  if (analysis.length === 0) return null;

  const width = 600;
  const height = 120;
  const padding = { top: 10, right: 20, bottom: 20, left: 35 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // 評分範圍限制在 -500 到 +500 centipawns (-5 到 +5 pawns)
  const maxCp = 500;
  const minCp = -500;

  // 將評分轉換為 Y 座標
  function cpToY(cp: number | null, mateIn: number | null): number {
    let value = 0;
    if (mateIn !== null) {
      // 將死視為極大優勢
      value = mateIn > 0 ? maxCp : minCp;
    } else if (cp !== null) {
      value = Math.max(minCp, Math.min(maxCp, cp));
    }
    // 映射到 Y 座標（反轉，因為 SVG 的 Y 軸向下）
    const ratio = (value - minCp) / (maxCp - minCp);
    return padding.top + chartHeight * (1 - ratio);
  }

  // 將 ply 轉換為 X 座標
  function plyToX(ply: number): number {
    const maxPly = analysis[analysis.length - 1].ply;
    const ratio = (ply - 1) / Math.max(1, maxPly - 1);
    return padding.left + chartWidth * ratio;
  }

  // 生成折線路徑
  const points = analysis.map(a => ({
    x: plyToX(a.ply),
    y: cpToY(a.cp, a.mate_in),
  }));

  const pathData = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  // 中線（均勢線）
  const midY = cpToY(0, null);

  return (
    <div className="eval-graph">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* 背景區域 - 白方優勢 */}
        <rect
          x={padding.left}
          y={padding.top}
          width={chartWidth}
          height={(midY - padding.top)}
          fill="rgba(255, 255, 255, 0.03)"
        />

        {/* 背景區域 - 黑方優勢 */}
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
            r="2.5"
            fill="var(--brass)"
            opacity="0.6"
          />
        ))}
      </svg>
    </div>
  );
}
