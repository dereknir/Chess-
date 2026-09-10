import type { Game } from './db';

/** 終局一句話：「Derek 獲勝　·　將死」「和棋」「逼和」。首頁與複盤頁共用。 */
export function headline(game: Game, white: string, black: string) {
  if (game.result === '1/2-1/2') {
    return game.status === 'stalemate' ? '逼和' : '和棋';
  }
  const winner = game.result === '1-0' ? white : black;
  const how = game.status === 'resigned' ? '對手認輸' : '將死';
  return `${winner} 獲勝　·　${how}`;
}
