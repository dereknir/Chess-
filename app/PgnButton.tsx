'use client';

import { useState } from 'react';

/**
 * 複製 PGN。
 *
 * 這是整個「事後分析」功能的全部 —— 複製、貼到 Lichess 的 Import game，
 * 就拿到 Stockfish 標好的失誤與準確率。自己跑引擎划不來。
 */
export default function PgnButton({ pgn }: { pgn: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(pgn);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button className="btn-ghost" onClick={copy}>
        {copied ? '已複製' : '複製 PGN'}
      </button>
      <a
        className="btn-ghost"
        href="https://lichess.org/paste"
        target="_blank"
        rel="noreferrer"
      >
        丟去分析
      </a>
    </>
  );
}
