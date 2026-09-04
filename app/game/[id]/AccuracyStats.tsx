type Props = {
  overall: number | null;
  opening: number | null;
  middlegame: number | null;
  endgame: number | null;
  bests: number;
  goods: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
};

export default function AccuracyStats({
  overall,
  opening,
  middlegame,
  endgame,
  bests,
  goods,
  inaccuracies,
  mistakes,
  blunders,
}: Props) {
  if (overall === null) return null;

  return (
    <div className="accuracy-stats-compact">
      {/* 第一行：精準率（標籤在上、數值在下、置中） */}
      <div className="acc-row acc-accuracy">
        <div className="acc-cell acc-overall">
          <span className="acc-cell-label">準確率</span>
          <span className="acc-cell-value">{overall}%</span>
        </div>
        {opening !== null && (
          <div className="acc-cell">
            <span className="acc-cell-label">開局</span>
            <span className="acc-cell-value">{opening}%</span>
          </div>
        )}
        {middlegame !== null && (
          <div className="acc-cell">
            <span className="acc-cell-label">中局</span>
            <span className="acc-cell-value">{middlegame}%</span>
          </div>
        )}
        {endgame !== null && (
          <div className="acc-cell">
            <span className="acc-cell-label">殘局</span>
            <span className="acc-cell-value">{endgame}%</span>
          </div>
        )}
      </div>

      {/* 第二行：每步評價（符號在上、數量在下、置中） */}
      <div className="acc-row acc-marks">
        <div className="acc-cell best" title="最佳步（!!）">
          <span className="acc-cell-label">!!</span>
          <span className="acc-cell-value">{bests}</span>
        </div>
        <div className="acc-cell good" title="良好步（!）">
          <span className="acc-cell-label">!</span>
          <span className="acc-cell-value">{goods}</span>
        </div>
        <div className="acc-cell inaccuracy" title="不精確（?!）">
          <span className="acc-cell-label">?!</span>
          <span className="acc-cell-value">{inaccuracies}</span>
        </div>
        <div className="acc-cell mistake" title="失誤（?）">
          <span className="acc-cell-label">?</span>
          <span className="acc-cell-value">{mistakes}</span>
        </div>
        <div className="acc-cell blunder" title="重大失誤（??）">
          <span className="acc-cell-label">??</span>
          <span className="acc-cell-value">{blunders}</span>
        </div>
      </div>
    </div>
  );
}
