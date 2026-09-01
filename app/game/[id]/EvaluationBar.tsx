import type { MoveAnalysis } from '@/lib/db';

type Props = {
  analysis: MoveAnalysis | null;
};

export default function EvaluationBar({ analysis }: Props) {
  if (!analysis) {
    // 無分析資料時，顯示均勢
    return (
      <div className="eval-bar">
        <div className="eval-bar-inner">
          <div className="eval-bar-white" style={{ height: '50%' }} />
          <div className="eval-bar-black" style={{ height: '50%' }} />
        </div>
      </div>
    );
  }

  let whitePercent = 50; // 預設均勢
  let displayText = '0.0';

  if (analysis.mate_in !== null) {
    // Mate 評估
    if (analysis.mate_in > 0) {
      whitePercent = 95; // 白棋將殺
      displayText = `#${analysis.mate_in}`;
    } else {
      whitePercent = 5; // 黑棋將殺
      displayText = `#${-analysis.mate_in}`;
    }
  } else if (analysis.cp !== null) {
    // CP 評估（從輪到走的人視角）
    // 轉換成百分比：使用 tanh 函數平滑映射
    // cp = 0 → 50%, cp = 100 → ~58%, cp = 500 → ~87%, cp = 1000 → ~96%
    const cpClamped = Math.max(-1000, Math.min(1000, analysis.cp));
    const ratio = Math.tanh(cpClamped / 500);
    whitePercent = 50 + ratio * 45; // 50% ± 45% = [5%, 95%]

    displayText = (Math.abs(analysis.cp) / 100).toFixed(1);
  }

  const blackPercent = 100 - whitePercent;

  return (
    <div className="eval-bar">
      <div className="eval-bar-inner">
        <div
          className="eval-bar-white"
          style={{ height: `${whitePercent}%` }}
        >
          {whitePercent > 50 && (
            <span className="eval-text">{displayText}</span>
          )}
        </div>
        <div
          className="eval-bar-black"
          style={{ height: `${blackPercent}%` }}
        >
          {blackPercent > 50 && (
            <span className="eval-text">{displayText}</span>
          )}
        </div>
      </div>
    </div>
  );
}
