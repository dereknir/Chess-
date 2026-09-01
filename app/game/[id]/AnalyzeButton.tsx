type Props = {
  hasAnalysis: boolean;
  analysisStatus: string | null;
};

export default function AnalyzeButton({ hasAnalysis, analysisStatus }: Props) {
  if (hasAnalysis || analysisStatus === 'completed') {
    return (
      <div className="analysis-status">
        ✅ 已分析
      </div>
    );
  }

  return (
    <div className="analysis-info">
      <p className="info-text">
        💡 請使用本地 Stockfish 分析工具：<code>node analyze-local.mjs</code>
      </p>
    </div>
  );
}
