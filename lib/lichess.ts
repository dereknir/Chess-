/**
 * Lichess API 整合：Cloud Eval、Opening Explorer、Tablebase
 */

export type LichessCloudEval = {
  fen: string;
  knodes: number;
  depth: number;
  pvs: Array<{
    moves: string;  // UCI format: "e2e4 e7e5 g1f3"
    cp?: number;    // centipawns (100 = 1 pawn)
    mate?: number;  // mate in N moves
  }>;
};

/**
 * 查詢 Lichess Cloud Eval
 *
 * @param fen - 局面 FEN 字串
 * @param multiPv - 取得前幾個最佳走法（1-5）
 * @returns Cloud eval 結果，如果沒有快取則回傳 null
 */
export async function fetchCloudEval(
  fen: string,
  multiPv: number = 1
): Promise<LichessCloudEval | null> {
  try {
    const url = new URL('https://lichess.org/api/cloud-eval');
    url.searchParams.set('fen', fen);
    url.searchParams.set('multiPv', multiPv.toString());

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`[Lichess] Cloud eval failed: ${response.status}`);
      return null;
    }

    const data: LichessCloudEval = await response.json();

    // 如果沒有分析結果（pvs 是空的），回傳 null
    if (!data.pvs || data.pvs.length === 0) {
      return null;
    }

    return data;
  } catch (err) {
    console.error('[Lichess] Cloud eval error:', err);
    return null;
  }
}

/**
 * Rate-limited 版本的 fetchCloudEval
 * 每次呼叫間隔至少 600ms，避免觸發 Lichess rate limit
 */
let lastCallTime = 0;
const MIN_INTERVAL = 600; // ms

export async function fetchCloudEvalWithRateLimit(
  fen: string,
  multiPv: number = 1
): Promise<LichessCloudEval | null> {
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;

  if (timeSinceLastCall < MIN_INTERVAL) {
    const waitTime = MIN_INTERVAL - timeSinceLastCall;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastCallTime = Date.now();
  return fetchCloudEval(fen, multiPv);
}

/**
 * 從 UCI 走法字串（例如 "e2e4"）轉換成簡化的局面描述
 * 用於除錯與日誌
 */
export function parseUciMove(uci: string): { from: string; to: string; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  };
}
