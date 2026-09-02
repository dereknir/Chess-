import type { Move, MoveAnalysis } from '@/lib/db';
import EvaluationGraph from './EvaluationGraph';

type Props = {
  moves: Move[];
  initialFen: string;
  /** 有值就顯示在表頭右側，例如 "Derek 執白" */
  caption?: string;
  analysis?: MoveAnalysis[];
  footer?: React.ReactNode;
  /** 使用者的顏色，用於評估圖視角調整 */
  userColor?: 'white' | 'black';
};

/**
 * 記譜表。
 *
 * 刻意做成紙本的樣子 —— 每列一個回合、白黑兩欄、等寬字。
 * 它本來就是一張表格，用表格的形式呈現不是裝飾，是最誠實的做法。
 */
export default function MoveLog({ moves, initialFen, caption, analysis, footer, userColor }: Props) {
  const rows = pairByFullmove(moves, initialFen);

  // 建立 ply -> analysis 的映射
  const analysisMap = new Map<number, MoveAnalysis>();
  analysis?.forEach(a => analysisMap.set(a.ply, a));

  return (
    <aside className="sheet">
      <header>
        <h2>記譜</h2>
        {caption && <span className="meta">{caption}</span>}
      </header>

      {analysis && analysis.length > 0 && (
        <EvaluationGraph analysis={analysis} moves={moves} initialFen={initialFen} userColor={userColor} />
      )}

      {rows.length === 0 ? (
        <p className="empty-note">還沒有人落子。</p>
      ) : (
        <ol className="rows">
          {rows.map((row) => (
            <li key={row.no}>
              <span className="no">{row.no}</span>
              <Cell
                move={row.white}
                analysis={row.white ? analysisMap.get(row.white.ply) : undefined}
              />
              <Cell
                move={row.black}
                analysis={row.black ? analysisMap.get(row.black.ply) : undefined}
              />
            </li>
          ))}
        </ol>
      )}

      {footer && <footer>{footer}</footer>}
    </aside>
  );
}

function Cell({ move, analysis }: { move: Move | null; analysis?: MoveAnalysis }) {
  if (!move) return <span className="cell" />;

  const classSymbol = getClassificationSymbol(analysis?.classification);
  const evalText = analysis ? formatEval(analysis.cp, analysis.mate_in) : null;

  return (
    <span className="cell">
      <span className="move-line">
        <span
          className="san"
          data-check={move.is_check}
          data-classification={analysis?.classification}
        >
          {move.san}
          {classSymbol && <span className="class-mark">{classSymbol}</span>}
        </span>
        {move.thinking_ms != null && (
          <span className="think">{formatThinking(move.thinking_ms)}</span>
        )}
      </span>
      {evalText && <span className="eval">{evalText}</span>}
      {analysis && analysis.classification && ['inaccuracy', 'mistake', 'blunder'].includes(analysis.classification) && (
        <span className="hint-move" title={`建議: ${analysis.best_move_san ?? analysis.best_move}`}>
          💡 {analysis.best_move_san ?? analysis.best_move}
        </span>
      )}
    </span>
  );
}

function getClassificationSymbol(classification?: string | null): string | null {
  switch (classification) {
    case 'best':
      return '✓';
    case 'good':
      return '';
    case 'inaccuracy':
      return '?!';
    case 'mistake':
      return '?';
    case 'blunder':
      return '??';
    default:
      return null;
  }
}

function formatEval(cp: number | null, mateIn: number | null): string | null {
  if (mateIn !== null) {
    return mateIn > 0 ? `+M${mateIn}` : `-M${Math.abs(mateIn)}`;
  }
  if (cp !== null) {
    const pawn = (cp / 100).toFixed(1);
    return cp >= 0 ? `+${pawn}` : pawn;
  }
  return null;
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
