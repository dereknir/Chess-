export type BoardTheme = {
  id: string;
  name: string;
  lightSquare: string;
  darkSquare: string;
};

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'classic',
    name: '經典',
    lightSquare: '#d9dce3',
    darkSquare: '#6b7a94',
  },
  {
    id: 'wooden',
    name: '木紋',
    lightSquare: '#f0d9b5',
    darkSquare: '#b58863',
  },
  {
    id: 'marble',
    name: '大理石',
    lightSquare: '#f0f0f0',
    darkSquare: '#303030',
  },
  {
    id: 'green',
    name: '森林',
    lightSquare: '#eeeed2',
    darkSquare: '#769656',
  },
];

export function getTheme(themeId: string | null): BoardTheme {
  const theme = BOARD_THEMES.find((t) => t.id === themeId);
  return theme || BOARD_THEMES[0]; // 預設經典主題
}
