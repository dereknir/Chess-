import { Chess } from 'chess.js';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ---- 從 lib/chess.ts 複製過來的邏輯 ----
function applyMove(fen, from, to, promotion) {
  const game = new Chess(fen);
  const move = game.move({ from, to, promotion: promotion ?? 'q' });
  return {
    san: move.san, uci: move.from + move.to + (move.promotion ?? ''),
    fenAfter: game.fen(), turnAfter: game.turn(),
    isCheck: game.inCheck(), isCapture: move.captured !== undefined,
    outcome: readOutcome(game),
  };
}
function readOutcome(game) {
  if (game.isCheckmate()) {
    const loser = game.turn();
    return { status:'checkmate', result: loser==='w'?'0-1':'1-0', winnerColor: loser==='w'?'b':'w' };
  }
  if (game.isStalemate()) return { status:'stalemate', result:'1/2-1/2' };
  if (game.isInsufficientMaterial()) return { status:'draw', result:'1/2-1/2', reason:'子力不足以將死' };
  if (game.isThreefoldRepetition()) return { status:'draw', result:'1/2-1/2', reason:'三次重複局面' };
  if (game.isDraw()) return { status:'draw', result:'1/2-1/2', reason:'50 步規則' };
  return { status:'ongoing' };
}
function isPlayableFen(fen) {
  try {
    const g = new Chess(fen);
    if (g.isGameOver()) return { ok:false, why:'這個局面已經結束了，開不了局。' };
    if (g.moves().length === 0) return { ok:false, why:'輪到走的一方沒有任何合法棋步。' };
    return { ok:true };
  } catch { return { ok:false, why:'FEN 格式不正確。' }; }
}
function buildPgn(o) {
  const d = o.date;
  const dateTag = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  const tags = [`[Event "通信對弈"]`,`[Site "-"]`,`[Date "${dateTag}"]`,
    `[White "${o.white}"]`,`[Black "${o.black}"]`,`[Result "${o.result}"]`];
  if (o.initialFen !== STARTING_FEN) tags.push(`[SetUp "1"]`, `[FEN "${o.initialFen}"]`);
  const startFullmove = Number(o.initialFen.split(' ')[5] ?? 1);
  const startsWithBlack = o.initialFen.split(' ')[1] === 'b';
  const parts = [];
  o.sans.forEach((san, i) => {
    const isWhiteMove = startsWithBlack ? i%2===1 : i%2===0;
    const fullmove = startFullmove + Math.floor((i + (startsWithBlack?1:0)) / 2);
    if (isWhiteMove) parts.push(`${fullmove}.`);
    else if (i===0) parts.push(`${fullmove}...`);
    parts.push(san);
  });
  return `${tags.join('\n')}\n\n${parts.join(' ')} ${o.result}\n`;
}

// ================= TESTS =================
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); console.log('  ✓', name); pass++; }
  catch(e){ console.log('  ✗', name, '\n     →', e.message); fail++; } };
const eq = (a,b,m) => { if (JSON.stringify(a)!==JSON.stringify(b))
  throw new Error(`${m??''} got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); };

console.log('\n【基本走子】');
t('e4 產生正確 SAN/UCI', () => {
  const r = applyMove(STARTING_FEN,'e2','e4');
  eq(r.san,'e4'); eq(r.uci,'e2e4'); eq(r.turnAfter,'b');
});
t('不合法走法會丟例外', () => {
  let threw=false; try{ applyMove(STARTING_FEN,'e2','e5'); }catch{ threw=true; }
  if(!threw) throw new Error('沒有丟例外');
});

console.log('\n【入堡】');
t('短入堡 SAN 是 O-O', () => {
  const f='r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1';
  eq(applyMove(f,'e1','g1').san,'O-O');
});
t('長入堡 SAN 是 O-O-O', () => {
  const f='r3kbnr/pppqpppp/2np4/8/8/2NPB3/PPPQPPPP/R3KBNR w KQkq - 0 1';
  eq(applyMove(f,'e1','c1').san,'O-O-O');
});
t('王動過就不能入堡（無入堡權的 FEN）', () => {
  const f='r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w kq - 0 1';
  let threw=false; try{ applyMove(f,'e1','g1'); }catch{ threw=true; }
  if(!threw) throw new Error('居然讓它入堡了');
});

console.log('\n【吃過路兵 / 升變】');
t('en passant', () => {
  const f='rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';
  const r = applyMove(f,'e5','f6');
  eq(r.san,'exf6'); if(!r.isCapture) throw new Error('沒認出是吃子');
});
t('升變成后', () => {
  const r = applyMove('8/4P3/8/8/8/8/8/K6k w - - 0 1','e7','e8','q');
  eq(r.san,'e8=Q'); eq(r.uci,'e7e8q');
});

console.log('\n【終局判定】');
t('傻瓜將死 → checkmate 0-1', () => {
  const g=new Chess(); ['f3','e5','g4'].forEach(m=>g.move(m));
  const r = applyMove(g.fen(),'d8','h4');
  eq(r.outcome.status,'checkmate'); eq(r.outcome.result,'0-1');
  eq(r.outcome.winnerColor,'b'); eq(r.san,'Qh4#');
});
t('逼和 → stalemate', () => {
  const r = applyMove('7k/8/8/6Q1/8/8/8/K7 w - - 0 1','g5','g6');
  eq(r.outcome.status,'stalemate'); eq(r.outcome.result,'1/2-1/2');
});
t('子力不足 → draw', () => {
  const r = applyMove('8/8/8/4k3/8/8/4n3/K7 w - - 0 1','a1','b1');
  eq(r.outcome.status,'draw');
});
t('單車殺王：邊線將軍 = 將死', () => {
  // 黑王 a5，白王 c5，白車 h1 → Ra1#
  const r = applyMove('8/8/8/k1K5/8/8/8/7R w - - 0 1','h1','a1');
  eq(r.san,'Ra1#'); eq(r.outcome.status,'checkmate'); eq(r.outcome.result,'1-0');
});
t('將軍會被標記 isCheck', () => {
  const r = applyMove('4k3/8/8/8/8/8/8/4K2R w K - 0 1','h1','h8');
  if(!r.isCheck) throw new Error('沒標記將軍');
});

console.log('\n【FEN 驗證】');
t('標準開局可用', () => { eq(isPlayableFen(STARTING_FEN).ok, true); });
t('殘局可用', () => { eq(isPlayableFen('8/8/8/4k3/8/4K3/4R3/8 w - - 0 1').ok, true); });
t('亂碼被擋', () => { eq(isPlayableFen('這不是 FEN').ok, false); });
t('已將死的局面被擋', () => {
  const r = isPlayableFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  eq(r.ok,false);
});
t('缺一方王的局面被擋', () => { eq(isPlayableFen('8/8/8/8/8/8/8/K7 w - - 0 1').ok, false); });

console.log('\n【PGN】');
t('標準開局不帶 SetUp tag', () => {
  const p = buildPgn({white:'Derek',black:'對手',date:new Date('2026-08-27'),
    result:'1-0',initialFen:STARTING_FEN,sans:['e4','e5','Nf3']});
  if(p.includes('SetUp')) throw new Error('不該有 SetUp');
  if(!p.includes('1. e4 e5 2. Nf3')) throw new Error('movetext 錯：\n'+p);
});
t('殘局帶 SetUp + FEN，回合數接續', () => {
  const fen='8/8/8/4k3/8/4K3/4R3/8 b - - 0 24';
  const p = buildPgn({white:'Derek',black:'對手',date:new Date('2026-08-27'),
    result:'1/2-1/2',initialFen:fen,sans:['Kd5','Re1','Kc4']});
  if(!p.includes('[SetUp "1"]')) throw new Error('缺 SetUp');
  if(!p.includes(`[FEN "${fen}"]`)) throw new Error('缺 FEN tag');
  if(!p.includes('24... Kd5 25. Re1 Kc4')) throw new Error('黑先殘局 movetext 錯：\n'+p);
});
t('PGN 能被 chess.js 讀回去（round-trip）', () => {
  const g=new Chess(); ['e4','e5','Nf3','Nc6','Bb5'].forEach(m=>g.move(m));
  const p = buildPgn({white:'A',black:'B',date:new Date('2026-08-27'),
    result:'*',initialFen:STARTING_FEN,sans:['e4','e5','Nf3','Nc6','Bb5']});
  const back=new Chess(); back.loadPgn(p);
  eq(back.fen(), g.fen(), 'round-trip FEN 不一致');
});
t('殘局 PGN 也能 round-trip', () => {
  const fen='8/8/8/4k3/8/4K3/4R3/8 b - - 0 24';
  const g=new Chess(fen); ['Kd5','Re1','Kc4'].forEach(m=>g.move(m));
  const p = buildPgn({white:'A',black:'B',date:new Date('2026-08-27'),
    result:'*',initialFen:fen,sans:['Kd5','Re1','Kc4']});
  const back=new Chess(); back.loadPgn(p);
  eq(back.fen(), g.fen(), '殘局 round-trip 不一致');
});

console.log(`\n${pass} 通過, ${fail} 失敗\n`);
process.exit(fail ? 1 : 0);
