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
const ANALYSIS_TIME_MS = 15000; // 每步分析時間 15 秒（能算多深就多深）

/**
 * 使用 Stockfish 分析局面
 */
async function analyzePosition(fen, multiPv = 3) {
  return new Promise((resolve, reject) => {
    const stockfish = spawn(STOCKFISH_PATH);
    let output = '';
    let analysisTimeout;
    let safetyTimeout;

    stockfish.stdout.on('data', (data) => {
      output += data.toString();
    });

    stockfish.stderr.on('data', (data) => {
      console.error('Stockfish error:', data.toString());
    });

    stockfish.on('close', () => {
      clearTimeout(analysisTimeout);
      clearTimeout(safetyTimeout);

      // 解析 Stockfish 輸出 - 取最深的分析結果
      const lines = output.split('\n');
      const pvsByDepth = new Map(); // depth -> pvs array
      let maxDepth = 0;

      for (const line of lines) {
        if (line.includes('depth') && line.includes('multipv')) {
          const depthMatch = line.match(/depth (\d+)/);
          const pvMatch = line.match(/multipv (\d+)/);
          const cpMatch = line.match(/cp (-?\d+)/);
          const mateMatch = line.match(/mate (-?\d+)/);
          const movesMatch = line.match(/ pv (.+)/);

          if (depthMatch && pvMatch && movesMatch) {
            const depth = parseInt(depthMatch[1]);
            const pvIndex = parseInt(pvMatch[1]) - 1;

            if (!pvsByDepth.has(depth)) {
              pvsByDepth.set(depth, []);
            }

            const pvs = pvsByDepth.get(depth);
            pvs[pvIndex] = {
              moves: movesMatch[1].trim(),
              cp: cpMatch ? parseInt(cpMatch[1]) : null,
              mate: mateMatch ? parseInt(mateMatch[1]) : null,
            };

            maxDepth = Math.max(maxDepth, depth);
          }
        }
      }

      const bestPvs = pvsByDepth.get(maxDepth);
      if (bestPvs && bestPvs.length > 0) {
        resolve({ pvs: bestPvs, depth: maxDepth });
      } else {
        reject(new Error('No analysis output'));
      }
    });

    // 發送命令
    stockfish.stdin.write('uci\n');
    stockfish.stdin.write(`setoption name MultiPV value ${multiPv}\n`);
    stockfish.stdin.write('ucinewgame\n');
    stockfish.stdin.write(`position fen ${fen}\n`);
    stockfish.stdin.write(`go movetime ${ANALYSIS_TIME_MS}\n`); // 改用固定時間

    // 設定分析時間結束後發送 stop（保險起見）
    analysisTimeout = setTimeout(() => {
      stockfish.stdin.write('stop\n');
      setTimeout(() => {
        stockfish.stdin.write('quit\n');
      }, 100);
    }, ANALYSIS_TIME_MS + 1000); // 分析時間 + 1 秒緩衝

    // 設定安全超時（最多 30 秒），防止完全卡死
    safetyTimeout = setTimeout(() => {
      stockfish.stdin.write('stop\n');
      setTimeout(() => {
        stockfish.stdin.write('quit\n');
        stockfish.kill();
      }, 100);
    }, 30000);
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
 * 分類走法品質
 *
 * @param bestCp 最佳走法的評估（從當前視角）
 * @param actualMoveCp 實際走法的評估（從當前視角）
 * @param ply 當前步數
 */
function classifyMove(bestCp, actualMoveCp, ply) {
  if (actualMoveCp === null || bestCp === null) return null;

  // 評估差異（都是從同一視角，所以直接相減）
  const cpDiff = actualMoveCp - bestCp;

  // cpDiff 負數 = 實際走法比最佳走法差
  if (cpDiff >= -10) return 'best';
  if (cpDiff >= -50) return 'good';
  if (cpDiff >= -100) return 'inaccuracy';
  if (cpDiff >= -300) return 'mistake';
  return 'blunder';
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

  console.log(`📊 共 ${moves.length} 步需要分析`);

  let analyzedCount = 0;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const fenBefore = i === 0 ? game.initial_fen : moves[i - 1].fen_after;
    const fenAfter = move.fen_after;

    process.stdout.write(`\r分析中... ${i + 1}/${moves.length} (${move.san})`);

    try {
      // 分析步前局面
      const resultBefore = await analyzePosition(fenBefore, 3);
      if (!resultBefore || !resultBefore.pvs || resultBefore.pvs.length === 0 || !resultBefore.pvs[0]) {
        console.error(`\n⚠️  ply ${move.ply} 無法取得步前評估，跳過`);
        continue;
      }

      const evalBefore = resultBefore.pvs;
      const actualDepth = resultBefore.depth;
      const bestPv = evalBefore[0];
      if (!bestPv.moves) {
        console.error(`\n⚠️  ply ${move.ply} 步前評估缺少走法，跳過`);
        continue;
      }

      const bestMove = bestPv.moves.split(' ')[0];

      // 分析步後局面
      const resultAfter = await analyzePosition(fenAfter, 1);
      if (!resultAfter || !resultAfter.pvs || resultAfter.pvs.length === 0 || !resultAfter.pvs[0]) {
        console.error(`\n⚠️  ply ${move.ply} 無法取得步後評估，跳過`);
        continue;
      }

      const evalAfter = resultAfter.pvs;
      const currentCp = evalAfter[0].cp;
      const currentMate = evalAfter[0].mate;

      // 判斷實際走法排名和評估
      const actualMoveIndex = evalBefore.findIndex(pv =>
        pv && pv.moves && pv.moves.split(' ')[0] === move.uci
      );
      const actualMoveRank = actualMoveIndex === -1 ? 99 : actualMoveIndex + 1;

      // 分類走法
      let classification;
      if (actualMoveIndex !== -1) {
        // 走法在 MultiPV 中，可以精確比較
        const actualMoveCp = evalBefore[actualMoveIndex].cp;
        classification = classifyMove(bestPv.cp, actualMoveCp, move.ply);
      } else {
        // 走法不在前3名，標記為 blunder（因為無法精確評估）
        classification = 'blunder';
      }

      const bestMoveSan = uciToSan(fenBefore, bestMove);

      // 儲存
      await sql`
        insert into move_analysis (
          game_id, ply, cp, mate_in, depth, best_move, best_move_san,
          actual_move_rank, classification
        ) values (
          ${gameId}, ${move.ply}, ${currentCp}, ${currentMate},
          ${actualDepth}, ${bestMove}, ${bestMoveSan},
          ${actualMoveRank}, ${classification}
        )
      `;

      analyzedCount++;

    } catch (err) {
      console.error(`\n❌ 分析 ply ${move.ply} 失敗:`, err.message);
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
