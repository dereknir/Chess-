'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  gameId: number;
  hasAnalysis: boolean;
  analysisStatus: string | null;
};

export default function AnalyzeButton({ gameId, hasAnalysis, analysisStatus }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(analysisStatus === 'analyzing');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const eventSourceRef = useRef<EventSource | null>(null);
  const router = useRouter();

  // 如果頁面載入時正在分析，重新建立連接
  useEffect(() => {
    if (analysisStatus === 'analyzing') {
      connectToAnalysis();
    }
  }, []);

  function connectToAnalysis() {
    setError(null);
    setAnalyzing(true);
    setProgress({ current: 0, total: 0 });

    // 創建 EventSource 連接
    const eventSource = new EventSource(`/api/analyze/${gameId}`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('start', (e) => {
      const data = JSON.parse(e.data);
      setProgress({ current: 0, total: data.total });
    });

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setProgress({ current: data.current, total: data.total });
    });

    eventSource.addEventListener('complete', (e) => {
      eventSource.close();
      setAnalyzing(false);
      router.refresh();
    });

    eventSource.addEventListener('error', (e: any) => {
      const data = e.data ? JSON.parse(e.data) : null;
      setError(data?.message || '分析失敗');
      eventSource.close();
      setAnalyzing(false);
    });

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        eventSource.close();
        setAnalyzing(false);
      }
    };
  }

  function handleAnalyze() {
    connectToAnalysis();
  }

  if (hasAnalysis || analysisStatus === 'completed') {
    return (
      <div className="analysis-status">
        ✅ 已分析
      </div>
    );
  }

  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="analysis-section">
      <button
        className="btn"
        onClick={handleAnalyze}
        disabled={analyzing}
      >
        {analyzing ? '分析中...' : '🔍 Stockfish 分析'}
      </button>
      {error && <p className="error-text">{error}</p>}
      {analyzing && (
        <div className="analysis-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="progress-text">
            {progress.current} / {progress.total} 步 ({progressPercent}%)
          </p>
        </div>
      )}
    </div>
  );
}
