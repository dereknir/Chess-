'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { analyzeGame } from '@/app/actions';

type Props = {
  gameId: number;
  hasAnalysis: boolean;
};

export default function AnalyzeButton({ gameId, hasAnalysis }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleAnalyze() {
    setError(null);
    startTransition(async () => {
      const res = await analyzeGame(gameId);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  if (hasAnalysis) {
    return (
      <div className="analysis-status">
        ✅ 已分析
      </div>
    );
  }

  return (
    <div className="analysis-section">
      <button
        className="btn"
        onClick={handleAnalyze}
        disabled={pending}
      >
        {pending ? '分析中...' : '🔍 用 Stockfish 分析'}
      </button>
      {error && <p className="error-text">{error}</p>}
      {pending && (
        <p className="hint">
          正在查詢 Lichess Cloud Eval，大約需要 {Math.ceil(gameId * 0.6)} 秒...
        </p>
      )}
    </div>
  );
}
