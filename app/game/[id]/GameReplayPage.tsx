'use client';

import { useState } from 'react';
import Replay from './Replay';
import MoveLog from '../../MoveLog';
import PgnButton from '../../PgnButton';
import ReplayChatBox from './ReplayChatBox';
import MoveLogChatTabs from '../../MoveLogChatTabs';
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
      />
      <MoveLogChatTabs
        moveLogContent={
          <MoveLog
            moves={moves}
            initialFen={initialFen}
            caption={result}
            analysis={analysis}
            footer={<PgnButton pgn={pgn} />}
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
