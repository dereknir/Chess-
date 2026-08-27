import { Chess } from 'chess.js';

const BLANK = '8/8/8/8/8/8/8/8 w - - 0 1';

// 從 NewGame.tsx 複製
function parseBoard(fen) {
  const rows = fen.split(' ')[0].split('/');
  const files = 'abcdefgh';
  const out = [];
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      const color = ch === ch.toUpperCase() ? 'w' : 'b';
      out.push([`${files[f]}${8 - r}`, color + ch.toUpperCase()]);
      f += 1;
    }
  });
  return out;
}
function withTurn(fen, turn) {
  const p = fen.split(' ');
  return [p[0], turn, '-', '-', '0', p[5] ?? '1'].join(' ');
}
function editBoard(fen, turn, mutate) {
  const g = new Chess(); g.clear();
  for (const [sq, pc] of parseBoard(fen)) {
    g.put({ type: pc[1].toLowerCase(), color: pc[0] }, sq);
  }
  mutate(g);
  return withTurn(g.fen(), turn);
}

let pass=0, fail=0;
const t=(n,f)=>{try{f();console.log('  ✓',n);pass++}catch(e){console.log('  ✗',n,'\n     →',e.message);fail++}};
const eq=(a,b,m)=>{if(a!==b)throw new Error(`${m??''}\n     got  ${a}\n     want ${b}`)};

console.log('\n【parseBoard 座標對不對】');
t('標準開局解析出 32 顆子', () => {
  eq(parseBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').length, 32);
});
t('a8 是黑車、e1 是白王', () => {
  const map = Object.fromEntries(parseBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
  eq(map['a8'],'bR','a8'); eq(map['e1'],'wK','e1'); eq(map['h8'],'bR','h8'); eq(map['d1'],'wQ','d1');
});
t('數字跳格算對（8/8/4k3/...）', () => {
  const map = Object.fromEntries(parseBoard('8/8/4k3/8/8/8/8/8 w - - 0 1'));
  eq(Object.keys(map).length,1); eq(map['e6'],'bk'==='bk'?'bK':'', 'e6 應是黑王');
});

console.log('\n【擺子往返】');
t('空盤放 3 顆子 → FEN 正確', () => {
  let fen = BLANK;
  fen = editBoard(fen,'w', g => g.put({type:'k',color:'b'},'a5'));
  fen = editBoard(fen,'w', g => g.put({type:'k',color:'w'},'c5'));
  fen = editBoard(fen,'w', g => g.put({type:'r',color:'w'},'h1'));
  eq(fen, '8/8/8/k1K5/8/8/8/7R w - - 0 1');
});
t('擺出來的局面接得上 applyMove（Ra1#）', () => {
  let fen = BLANK;
  fen = editBoard(fen,'w', g => g.put({type:'k',color:'b'},'a5'));
  fen = editBoard(fen,'w', g => g.put({type:'k',color:'w'},'c5'));
  fen = editBoard(fen,'w', g => g.put({type:'r',color:'w'},'h1'));
  const b = new Chess(fen);
  const r = b.move({from:'h1',to:'a1'});
  eq(r.san,'Ra1#'); eq(b.isCheckmate(), true);
});
t('移除棋子', () => {
  let fen = '8/8/8/k1K5/8/8/8/7R w - - 0 1';
  fen = editBoard(fen,'w', g => g.remove('h1'));
  eq(fen, '8/8/8/k1K5/8/8/8/8 w - - 0 1');
});
t('切換行動方會清掉入堡權（手擺局面沒有那段歷史）', () => {
  const fen = editBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1','b', ()=>{});
  eq(fen.split(' ')[1],'b');
  eq(fen.split(' ')[2],'-','入堡權應被清掉');
});
t('同色第二個王會被 chess.js 擋掉', () => {
  let fen = editBoard(BLANK,'w', g => g.put({type:'k',color:'w'},'e1'));
  const after = editBoard(fen,'w', g => {
    const ok = g.put({type:'k',color:'w'},'e2');
    if (ok !== false) throw new Error('居然放了第二個白王');
  });
  eq(after.split(' ')[0].replace(/[^K]/g,'').length, 1);
});

console.log('\n【和 isPlayableFen 的整合】');
const isPlayable = (fen)=>{try{const g=new Chess(fen);
  if(g.isGameOver())return false; if(g.moves().length===0)return false; return true;}catch{return false;}};
t('擺好的單車殘局 → 可開局', () => { eq(isPlayable('8/8/8/k1K5/8/8/8/7R w - - 0 1'), true); });
t('只放一個王 → 擋掉', () => { eq(isPlayable('8/8/8/8/8/8/8/4K3 w - - 0 1'), false); });
t('空盤 → 擋掉', () => { eq(isPlayable(BLANK), false); });

console.log(`\n${pass} 通過, ${fail} 失敗\n`);
process.exit(fail?1:0);
