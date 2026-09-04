#!/usr/bin/env node

/**
 * 本地棋局分析工具
 *
 * 使用本地 Stockfish 引擎分析棋局，將結果儲存到資料庫
 *
 * 使用方式：
 *   node analyze-local.mjs              # 分析所有未分析的棋局
 *   node analyze-local.mjs 5            # 分析指定棋局
 *   node analyze-local.mjs --pending    # 只顯示待分析的棋局清單
 *
 * 前置需求：
 *   brew install stockfish  (macOS)
 *   apt install stockfish   (Ubuntu/Debian)
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { Chess } from 'chess.js';

const envContent = readFileSync('.env.local', 'utf-8');
const DATABASE_URL = envContent
  .split('\n')
  .find(line => line.startsWith('DATABASE_URL='))
  ?.split('=')[1]
  ?.trim();

const sql = postgres(DATABASE_URL, {
  max: 1,
  prepare: false,
  idle_timeout: 20,
  ssl: 'require',
});

// Stockfish 設定
const STOCKFISH_PATH = 'stockfish'; // 或指定完整路徑
// 每步分析時間 30 秒。
// 為什麼拉長：改用單執行緒後單位時間搜得較淺，拉長時間補回深度，
// 確保像 Q+R vs Q 這種堡壘型殘局能穩定鑽到 mate，而非淺層誤判成 cp 0。
const ANALYSIS_TIME_MS = 30000;
// 單執行緒：多執行緒(Threads>1)的搜尋是「非決定性」的，同一局面在不同時間/負載
// 可能一次找到 mate、一次卡在 cp 0，造成殘局出現 97.5%↔50% 的幽靈 blunder。
// 改成 Threads=1 換取「可重現性」——同一局面每次結果一致。
const SF_THREADS = 1;
const SF_HASH_MB = 256; // 置換表大小（MB）

/**
 * 解析單行 Stockfish `info` 輸出，取出 depth / score。
 *
 * 只接受同時具備 depth、score(cp|mate)、pv 且「不含 lowerbound/upperbound」的行。
 * 回傳 { depth, cp, mate } 或 null（該行不是有效的完整評估行）。
 *
 * 之所以要嚴格過濾，是因為：
 *  - `info string ...`：引擎資訊，非評估
 *  - `lowerbound/upperbound`：aspiration window 的邊界值，cp 不可靠（會出現 -7122 這種垃圾值）
 *  - 沒有 pv 的行：通常是 depth 統計行，非最終主線評估
 */
function parseInfoLine(line) {
  if (!line.startsWith('info ')) return null;
  if (line.includes('lowerbound') || line.includes('upperbound')) return null;
  if (!line.includes(' pv ')) return null;

  const depthMatch = line.match(/\bdepth (\d+)/);
  const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
  if (!depthMatch || !scoreMatch) return null;

  const depth = parseInt(depthMatch[1], 10);
  const type = scoreMatch[1];
  const value = parseInt(scoreMatch[2], 10);

  return {
    depth,
    cp: type === 'cp' ? value : null,
    mate: type === 'mate' ? value : null,
  };
}

/**
 * 從終局局面直接推導評估（不需引擎）。
 *
 * 有些壓倒性/將死局面 Stockfish 18 會秒回 bestmove 而不輸出 info 行，
 * 導致抓不到評估。這裡用 chess.js 判斷終局狀態作為 fallback。
 *
 * 回傳 { cp, mate, depth } 或 null（非終局，需引擎分析）。
 */
function terminalEval(fen) {
  let chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }
  // 被將死：輪走方已無棋可走且被將軍 → 對走方是 mate 0（負面極值）
  if (chess.isCheckmate()) {
    return { cp: null, mate: 0, depth: 0 };
  }
  // 和棋（逼和／50 步／重複／子力不足）→ 均勢 0
  if (chess.isStalemate() || chess.isInsufficientMaterial() ||
      chess.isThreefoldRepetition() || chess.isDraw()) {
    return { cp: 0, mate: null, depth: 0 };
  }
  return null;
}

/**
 * 使用 Stockfish 分析局面（只取主線，對齊 Lichess）
 *
 * 採用逐行狀態機解析：
 *  - 用 readline 逐行讀取，只採信通過 parseInfoLine 的完整評估行
 *  - 追蹤「看過的最高 depth」的評估（同 depth 以較晚出現者為準）
 *  - 收到 bestmove 即結束
 *  - 若完全沒有有效評估行，改用 terminalEval fallback
 */
async function analyzePosition(fen) {
  // 先檢查是否為終局，是的話直接回傳（省去引擎呼叫）
  const terminal = terminalEval(fen);
  if (terminal) return terminal;

  return new Promise((resolve, reject) => {
    const stockfish = spawn(STOCKFISH_PATH);
    const rl = createInterface({ input: stockfish.stdout });

    let bestEval = null;
    let maxDepth = -1;
    let finished = false;
    let analysisTimeout;
    let safetyTimeout;

    const cleanup = () => {
      clearTimeout(analysisTimeout);
      clearTimeout(safetyTimeout);
      rl.close();
      try { stockfish.stdin.write('quit\n'); } catch {}
      try { stockfish.kill(); } catch {}
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      if (bestEval) {
        resolve(bestEval);
      } else {
        // 引擎沒給有效評估行（可能是壓倒性局面秒回 bestmove）
        // 再嘗試一次 terminalEval，仍不行才 reject
        const t = terminalEval(fen);
        if (t) resolve(t);
        else reject(new Error('No analysis output'));
      }
    };

    rl.on('line', (line) => {
      const parsed = parseInfoLine(line);
      if (parsed) {
        // 同 depth 以較晚（更精煉）者為準；只往更高 depth 更新
        if (parsed.depth >= maxDepth) {
          maxDepth = parsed.depth;
          bestEval = { cp: parsed.cp, mate: parsed.mate, depth: parsed.depth };
        }
      } else if (line.startsWith('bestmove')) {
        finish();
      }
    });

    stockfish.stderr.on('data', (data) => {
      console.error('Stockfish error:', data.toString());
    });

    stockfish.on('close', () => finish());

    // 發送命令（設定引擎參數，不使用 MultiPV）
    stockfish.stdin.write('uci\n');
    stockfish.stdin.write(`setoption name Threads value ${SF_THREADS}\n`);
    stockfish.stdin.write(`setoption name Hash value ${SF_HASH_MB}\n`);
    stockfish.stdin.write('ucinewgame\n');
    stockfish.stdin.write(`position fen ${fen}\n`);
    stockfish.stdin.write(`go movetime ${ANALYSIS_TIME_MS}\n`);

    // 分析時間結束後發送 stop（引擎會回 bestmove 觸發 finish）
    analysisTimeout = setTimeout(() => {
      try { stockfish.stdin.write('stop\n'); } catch {}
    }, ANALYSIS_TIME_MS + 1000);

    // 安全超時，防止完全卡死。
    // 必須晚於「分析時間 + stop 緩衝」，否則會在引擎正常回 bestmove 前就強制結束。
    safetyTimeout = setTimeout(() => {
      finish();
    }, ANALYSIS_TIME_MS + 15000);
  });
}

/**
 * 將 UCI 走法轉換成 SAN
 */
function uciToSan(fen, uci) {
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
    return move ? move.san : null;
  } catch {
    return null;
  }
}

/**
 * winningChances：CP → 勝率機率，範圍 [-1, +1]
 * 完全對齊 scalachess eval.scala 的 WinPercent.winningChances：
 *
 *   def winningChances(cp) = { 2 / (1 + exp(-0.00368208 * cp.ceiled)) - 1 }.atLeast(-1).atMost(+1)
 *
 * 注意：Lichess 的走法分類（Advice.scala）用的是「這個 [-1,+1] 尺度」的 delta，
 *       閾值為 0.1 / 0.2 / 0.3，而非 [0,100] 的 WinPercent。
 */
function winningChances(cp) {
  const CEILING = 1000; // scalachess Eval.Cp.CEILING
  const ceiled = cp > CEILING ? CEILING : cp < -CEILING ? -CEILING : cp; // Cp.ceiled
  const wc = 2 / (1 + Math.exp(-0.00368208 * ceiled)) - 1;
  return Math.max(-1, Math.min(1, wc)); // atLeast(-1).atMost(+1)
}

/**
 * 將 CP 值轉換為勝率（0-100），供顯示用途。
 * WinPercent.fromCentiPawns = 50 + 50 * winningChances(cp.ceiled)
 */
function cpToWinPercent(cp) {
  return 50 + 50 * winningChances(cp);
}

/**
 * 分類走法品質（對齊 Lichess：步前 vs 步後）
 *
 * @param cpBefore 步前評估 CP（從當前輪到走的一方視角）
 * @param mateBefore 步前評估 Mate
 * @param cpAfter 步後評估 CP（從對手視角，需要翻轉）
 * @param mateAfter 步後評估 Mate（從對手視角，需要翻轉）
 */
function classifyMove(cpBefore, mateBefore, cpAfter, mateAfter) {
  // Lichess scalachess 的 WinPercent.fromMate：
  //   mate → Cp.ceilingWithSignum(signum) → ±1000 → winningChances
  //   signum：mate > 0 → +1，否則（含 0）→ -1
  // 回傳 [-1,+1] 的 winningChances。
  const mateWC = (mate) => winningChances(mate > 0 ? 1000 : -1000);

  // 檢查是否涉及 Mate 序列變化（見 lila Advice.scala 的 MateAdvice）
  const prevHasMate = mateBefore !== null;
  const currHasMate = mateAfter !== null;

  // MateCreated: 步前沒 Mate，步後被將死（對手視角的正 Mate = 我被將死）
  if (!prevHasMate && currHasMate && mateAfter > 0) {
    if (cpBefore !== null && cpBefore < -999) return 'inaccuracy';
    if (cpBefore !== null && cpBefore < -700) return 'mistake';
    return 'blunder';
  }

  // MateLost: 步前有將死機會，步後失去了
  if (prevHasMate && mateBefore > 0 && !currHasMate) {
    if (cpAfter !== null && -cpAfter > 999) return 'inaccuracy'; // 翻轉視角
    if (cpAfter !== null && -cpAfter > 700) return 'mistake';
    return 'blunder';
  }

  // MateLost: 步前有將死機會，步後變成被將死
  if (prevHasMate && mateBefore > 0 && currHasMate && mateAfter > 0) {
    if (cpAfter !== null && -cpAfter > 999) return 'inaccuracy';
    if (cpAfter !== null && -cpAfter > 700) return 'mistake';
    return 'blunder';
  }

  // 一般情況：用 winningChances 的 delta 判斷（對齊 Advice.scala）
  //   delta = winningChances(步前) - winningChances(步後翻轉回當前方)
  // 全程使用 [-1,+1] 尺度，閾值 0.1 / 0.2 / 0.3。
  let wcBefore;
  if (mateBefore !== null) {
    wcBefore = mateWC(mateBefore); // 步前為當前方視角
  } else if (cpBefore !== null) {
    wcBefore = winningChances(cpBefore);
  } else {
    return null;
  }

  let wcAfter;
  if (mateAfter !== null) {
    wcAfter = mateWC(-mateAfter); // 步後為對手視角，翻轉回當前方
  } else if (cpAfter !== null) {
    wcAfter = winningChances(-cpAfter); // 翻轉回當前方視角
  } else {
    return null;
  }

  const delta = wcBefore - wcAfter; // >0 表示走完後變差

  // Lichess winningChanceJudgements（Advice.scala）：閾值 0.3 / 0.2 / 0.1
  if (delta >= 0.3) return 'blunder';
  if (delta >= 0.2) return 'mistake';
  if (delta >= 0.1) return 'inaccuracy';
  // 以下 good/best 為本專案自訂（Lichess 官方不標記），
  // 用等價 wc 尺度：good 對應原 WinPercent 差 5% ≈ wc 差 0.05
  if (delta >= 0.05) return 'good';
  return 'best';
}

/**
 * 分析單一棋局
 */
async function analyzeGame(gameId) {
  console.log(`\n分析棋局 ${gameId}...`);

  const [game] = await sql`select * from games where id = ${gameId}`;
  if (!game) {
    console.error(`❌ 棋局 ${gameId} 不存在`);
    return;
  }

  // 檢查是否已分析
  const existing = await sql`
    select count(*) as count from move_analysis where game_id = ${gameId}
  `;

  if (existing[0].count > 0) {
    console.log(`⚠️  棋局 ${gameId} 已有 ${existing[0].count} 步分析記錄，跳過`);
    return;
  }

  const moves = await sql`
    select * from moves where game_id = ${gameId} order by ply
  `;

  // 建立「局面序列」：initial_fen, moves[0].fen_after, moves[1].fen_after, ...
  // 第 i 步（0-indexed）的步前 = positions[i]，步後 = positions[i+1]
  // 因此相鄰步驟共用同一局面，只需分析 moves.length + 1 個唯一局面。
  const positions = [game.initial_fen, ...moves.map(m => m.fen_after)];
  const totalPositions = positions.length;

  console.log(`📊 共 ${moves.length} 步，需分析 ${totalPositions} 個唯一局面（相鄰步驟共用）`);

  // 逐一分析每個唯一局面，結果存入 evals[]（與 positions 對齊）
  const evals = new Array(totalPositions).fill(null);
  for (let p = 0; p < totalPositions; p++) {
    process.stdout.write(`\r分析局面... ${p + 1}/${totalPositions}`);
    try {
      evals[p] = await analyzePosition(positions[p]);
    } catch (err) {
      console.error(`\n⚠️  局面 ${p} 分析失敗:`, err.message);
      evals[p] = null;
    }
  }
  console.log(''); // 換行

  let analyzedCount = 0;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const evalBefore = evals[i];     // 步前 = positions[i]
    const evalAfter = evals[i + 1];  // 步後 = positions[i+1]

    if (!evalBefore || !evalAfter) {
      console.error(`⚠️  ply ${move.ply} 缺少評估（步前或步後），跳過`);
      continue;
    }

    try {
      // 分類走法（步前 vs 步後）
      const classification = classifyMove(
        evalBefore.cp,
        evalBefore.mate,
        evalAfter.cp,
        evalAfter.mate
      );

      // 儲存
      // best_cp / best_mate_in 為「步前評估」；cp / mate_in 為「步後評估」
      await sql`
        insert into move_analysis (
          game_id, ply, cp, mate_in, best_cp, best_mate_in, depth, classification
        ) values (
          ${gameId}, ${move.ply}, ${evalAfter.cp}, ${evalAfter.mate},
          ${evalBefore.cp}, ${evalBefore.mate},
          ${evalAfter.depth}, ${classification}
        )
      `;

      analyzedCount++;

    } catch (err) {
      console.error(`❌ 分析 ply ${move.ply} 失敗:`, err.message);
    }
  }

  // 更新狀態
  await sql`
    update games set analysis_status = 'completed' where id = ${gameId}
  `;

  console.log(`\n✅ 完成！已分析 ${analyzedCount}/${moves.length} 步`);
}

/**
 * 列出待分析的棋局
 */
async function listPendingGames() {
  const games = await sql`
    select g.id, g.status, g.ply_count, g.ended_at,
           p1.display_name as white_name,
           p2.display_name as black_name,
           coalesce((select count(*) from move_analysis where game_id = g.id), 0) as analyzed_moves
    from games g
    join players p1 on g.white_id = p1.id
    join players p2 on g.black_id = p2.id
    where g.status != 'ongoing'
      and (g.analysis_status is null or g.analysis_status != 'completed')
    order by g.id desc
  `;

  console.log('\n待分析的棋局：\n');

  if (games.length === 0) {
    console.log('（無）');
  } else {
    games.forEach(g => {
      console.log(`  #${g.id} - ${g.white_name} vs ${g.black_name}`);
      console.log(`         ${g.ply_count} 步 · ${g.status} · ${g.analyzed_moves} 步已分析`);
    });
  }
}

/**
 * 主程式
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--pending')) {
    await listPendingGames();
  } else if (args.length > 0) {
    // 分析指定棋局
    const gameId = parseInt(args[0]);
    if (isNaN(gameId)) {
      console.error('❌ 請提供有效的棋局 ID');
      process.exit(1);
    }
    await analyzeGame(gameId);
  } else {
    // 分析所有未分析的棋局
    await listPendingGames();

    const games = await sql`
      select id from games
      where status != 'ongoing'
        and (analysis_status is null or analysis_status != 'completed')
      order by id
    `;

    if (games.length === 0) {
      console.log('\n✨ 所有棋局都已分析完成！');
    } else {
      console.log(`\n開始分析 ${games.length} 場棋局...\n`);

      for (const game of games) {
        await analyzeGame(game.id);
      }

      console.log('\n\n🎉 全部完成！');
    }
  }

  await sql.end();
}

main().catch(err => {
  console.error('❌ 錯誤:', err);
  sql.end();
  process.exit(1);
});
