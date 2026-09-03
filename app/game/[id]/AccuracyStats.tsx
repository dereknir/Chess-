type Props = {
  overall: number | null;
  opening: number | null;
  middlegame: number | null;
  endgame: number | null;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
};

export default function AccuracyStats({
  overall,
  opening,
  middlegame,
  endgame,
  inaccuracies,
  mistakes,
  blunders,
}: Props) {
  if (overall === null) return null;

  return (
    <div className="accuracy-stats-compact">
      <span className="acc-phase">準確率 {overall}%</span>
      <span className="acc-sep">|</span>
      {opening !== null && <span className="acc-phase">開局 {opening}%</span>}
      {middlegame !== null && <span className="acc-phase">中局 {middlegame}%</span>}
      {endgame !== null && <span className="acc-phase">殘局 {endgame}%</span>}
      <span className="acc-sep">|</span>
      <span className="acc-mistake inaccuracy" title="不精確">?! {inaccuracies}</span>
      <span className="acc-mistake mistake" title="失誤">? {mistakes}</span>
      <span className="acc-mistake blunder" title="重大失誤">?? {blunders}</span>
    </div>
  );
}
