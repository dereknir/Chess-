import type { Move } from '@/lib/db';

type Props = {
  moves: Move[];
  initialFen: string;
  /** 有值就顯示在表頭右側，例如 "Derek 執白" */
  caption?: string;
  footer?: React.ReactNode;
};

/**
 * 記譜表。
 *
 * 刻意做成紙本的樣子 —— 每列一個回合、白黑兩欄、等寬字。
 * 它本來就是一張表格，用表格的形式呈現不是裝飾，是最誠實的做法。
 */
export default function MoveLog({ moves, initialFen, caption, footer }: Props) {
  const rows = pairByFullmove(moves, initialFen);

  return (
    <aside className="sheet">
      <header>
        <h2>記譜</h2>
        {caption && <span className="meta">{caption}</span>}
      </header>

      {rows.length === 0 ? (
        <p className="empty-note">還沒有人落子。</p>
      ) : (
        <ol className="rows">
          {rows.map((row) => (
            <li key={row.no}>
              <span className="no">{row.no}</span>
              <Cell move={row.white} />
              <Cell move={row.black} />
            </li>
          ))}
        </ol>
      )}

      {footer && <footer>{footer}</footer>}
    </aside>
  );
}

function Cell({ move }: { move: Move | null }) {
  if (!move) return <span className="cell" />;
  return (
    <span className="cell">
      <span className="san" data-check={move.is_check}>
        {move.san}
      </span>
      {move.thinking_ms != null && (
        <span className="think">{formatThinking(move.thinking_ms)}</span>
      )}
    </span>
  );
}

/**
 * 把半步序列配成「回合」。
 *
 * 殘局起始時第一手可能是黑方，而且回合數要從 FEN 的第六欄接續，
 * 不能從 1 開始重數 —— 不然搬過來的殘局記譜會跟原本對不上。
 */
function pairByFullmove(moves: Move[], initialFen: string) {
  const parts = initialFen.split(' ');
  const startNo = Number(parts[5] ?? 1) || 1;
  const blackFirst = parts[1] === 'b';

  const rows: { no: number; white: Move | null; black: Move | null }[] = [];

  moves.forEach((m, i) => {
    const isWhite = blackFirst ? i % 2 === 1 : i % 2 === 0;
    const no = startNo + Math.floor((i + (blackFirst ? 1 : 0)) / 2);

    let row = rows[rows.length - 1];
    if (!row || row.no !== no) {
      row = { no, white: null, black: null };
      rows.push(row);
    }
    if (isWhite) row.white = m;
    else row.black = m;
  });

  return rows;
}

function formatThinking(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
