'use client';

import { useState, useMemo } from 'react';
import Replay from './Replay';
import MoveLog from '../../MoveLog';
import PgnButton from '../../PgnButton';
import ReplayChatBox from './ReplayChatBox';
import MoveLogChatTabs from '../../MoveLogChatTabs';
import AccuracyStats from './AccuracyStats';
import { calculateGameAccuracy } from '@/lib/accuracy';
import type { Move, MoveAnalysis, ChatMessage } from '@/lib/db';

type Props = {
  initialFen: string;
  fens: string[];
  orientation: 'white' | 'black';
  moves: Move[];
  analysis?: MoveAnalysis[];
  pgn: string;
  result: string;
  myId: string;
  opponentName: string;
  chatMessages: ChatMessage[];
};

export default function GameReplayPage({
  initialFen,
  fens,
  orientation,
  moves,
  analysis,
  pgn,
  result,
  myId,
  opponentName,
  chatMessages,
}: Props) {
  const [currentPly, setCurrentPly] = useState(fens.length); // 從最後開始

  // 計算準確率統計
  const accuracyStats = useMemo(() => {
    if (!analysis || analysis.length === 0) return null;
    return calculateGameAccuracy(moves, analysis, orientation);
  }, [moves, analysis, orientation]);

  function handleJumpToPly(ply: number) {
    setCurrentPly(ply);
  }

  return (
    <div className="game">
      <Replay
        initialFen={initialFen}
        fens={fens}
        orientation={orientation}
        currentPly={currentPly}
        onPlyChange={setCurrentPly}
        moves={moves}
        analysis={analysis}
      />
      <MoveLogChatTabs
        moveLogContent={
          <MoveLog
            moves={moves}
            initialFen={initialFen}
            caption={result}
            analysis={analysis}
            footer={
              <>
                {accuracyStats && <AccuracyStats {...accuracyStats} />}
                <PgnButton pgn={pgn} />
              </>
            }
            userColor={orientation}
          />
        }
        chatContent={
          <ReplayChatBox
            messages={chatMessages}
            myId={myId}
            opponentName={opponentName}
            finalPlyCount={fens.length}
            onJumpToPly={handleJumpToPly}
          />
        }
      />
    </div>
  );
}
