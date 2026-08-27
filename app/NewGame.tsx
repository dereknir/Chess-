'use client';

import { useState, useTransition } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { newGame } from './actions';

const STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BLANK_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

const TRAY = [
  ['wK', '♔'], ['wQ', '♕'], ['wR', '♖'],
  ['wB', '♗'], ['wN', '♘'], ['wP', '♙'],
  ['bK', '♚'], ['bQ', '♛'], ['bR', '♜'],
  ['bB', '♝'], ['bN', '♞'], ['bP', '♟'],
] as const;

type Props = {
  players: { id: string; display_name: string }[];
  myId: string;
};

export default function NewGame({ players, myId }: Props) {
  const [whiteId, setWhiteId] = useState(myId);
  const [mode, setMode] = useState<'standard' | 'custom'>('standard');
  const [fen, setFen] = useState(BLANK_FEN);
  const [held, setHeld] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';

  /**
   * 擺盤期間的局面常常是「不合法」的（沒有王、兩個后…），chess.js 的
   * load() 會拒絕。所以每次編輯都從空盤重建：把現有棋子一顆顆 put 回去，
   * 再套用這次的異動。put() 本身會擋掉明顯錯誤，例如同色第二個王。
   */
  function editBoard(mutate: (g: Chess) => void) {
    const g = new Chess();
    g.clear();
    for (const [square, piece] of parseBoard(fen)) {
      g.put(
        { type: piece[1].toLowerCase() as never, color: piece[0] as never },
        square as never,
      );
    }
    mutate(g);
    setFen(withTurn(g.fen(), turn));
    setError(null);
  }

  function onSquareClick(square: string) {
    if (mode !== 'custom') return;
    editBoard((g) => {
      if (held) {
        g.put(
          { type: held[1].toLowerCase() as never, color: held[0] as never },
          square as never,
        );
      } else {
        g.remove(square as never);
      }
    });
  }

  function setTurn(t: 'w' | 'b') {
    setFen(withTurn(fen, t));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await newGame({
        whiteId,
        initialFen: mode === 'standard' ? STARTING_FEN : fen,
      });
      if (!res.ok) setError(res.message);
    });
  }

  return (
    <div className="panel">
      <h1>開新的一盤</h1>
      <p className="lede">同時只能有一盤在進行中。</p>

      <div className="field">
        <span className="legend">誰執白（先手）</span>
        <div className="choices">
          {players.map((p) => (
            <button
              key={p.id}
              type="button"
              className="choice"
              aria-pressed={whiteId === p.id}
              onClick={() => setWhiteId(p.id)}
            >
              {p.display_name}
              {p.id === myId && <small>你</small>}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="legend">起始局面</span>
        <div className="choices">
          <button
            type="button"
            className="choice"
            aria-pressed={mode === 'standard'}
            onClick={() => setMode('standard')}
          >
            標準開局
            <small>從頭開始</small>
          </button>
          <button
            type="button"
            className="choice"
            aria-pressed={mode === 'custom'}
            onClick={() => setMode('custom')}
          >
            接續殘局
            <small>自己擺子或貼 FEN</small>
          </button>
        </div>
      </div>

      {mode === 'custom' && (
        <>
          <div className="field">
            <label htmlFor="fen">FEN</label>
            <input
              id="fen"
              type="text"
              value={fen}
              onChange={(e) => setFen(e.target.value)}
              spellCheck={false}
            />
            <p className="hint">
              從別的 app 複製局面就貼這裡，或用下面的棋盤直接擺。
            </p>
          </div>

          <div className="field">
            <span className="legend">擺子</span>
            <div className="editor">
              <div className="board-frame">
                <Chessboard
                  position={fen.split(' ')[0]}
                  onSquareClick={onSquareClick}
                  arePiecesDraggable={false}
                />
              </div>

              <div className="tray">
                <span className="legend">
                  {held ? '點格子放子' : '點格子清空'}
                </span>
                <div className="tray-grid">
                  {TRAY.map(([code, glyph]) => (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={held === code}
                      aria-label={code}
                      onClick={() => setHeld(held === code ? null : code)}
                    >
                      {glyph}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ marginTop: 10, width: '100%' }}
                  onClick={() => setHeld(null)}
                >
                  改成清除
                </button>
              </div>
            </div>
          </div>

          <div className="field">
            <span className="legend">輪誰先走</span>
            <div className="choices">
              <button
                type="button"
                className="choice"
                aria-pressed={turn === 'w'}
                onClick={() => setTurn('w')}
              >
                白方
              </button>
              <button
                type="button"
                className="choice"
                aria-pressed={turn === 'b'}
                onClick={() => setTurn('b')}
              >
                黑方
              </button>
            </div>
          </div>
        </>
      )}

      <button className="btn" onClick={submit} disabled={pending}>
        {pending ? '開局中…' : '開始'}
      </button>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------- helpers ----------

/** 從 FEN 的第一欄讀出所有棋子，回傳 [格子, 'wK'] 的清單。 */
function parseBoard(fen: string): [string, string][] {
  const rows = fen.split(' ')[0].split('/');
  const files = 'abcdefgh';
  const out: [string, string][] = [];

  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        f += Number(ch);
        continue;
      }
      const color = ch === ch.toUpperCase() ? 'w' : 'b';
      out.push([`${files[f]}${8 - r}`, color + ch.toUpperCase()]);
      f += 1;
    }
  });

  return out;
}

/** 換掉 FEN 的行動方，並把入堡權與過路兵格清掉（手擺的局面沒有這些歷史）。 */
function withTurn(fen: string, turn: 'w' | 'b') {
  const p = fen.split(' ');
  return [p[0], turn, '-', '-', '0', p[5] ?? '1'].join(' ');
}
