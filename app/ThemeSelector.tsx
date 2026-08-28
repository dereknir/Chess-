'use client';

import { useState, useTransition } from 'react';
import { BOARD_THEMES } from '@/lib/themes';
import { updateBoardTheme } from './actions';

type Props = {
  currentTheme: string | null;
};

export default function ThemeSelector({ currentTheme }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSelect(themeId: string) {
    setError(null);
    startTransition(async () => {
      const res = await updateBoardTheme(themeId);
      if (res.ok) {
        setIsOpen(false);
      } else {
        setError(res.message);
      }
    });
  }

  const selectedTheme = BOARD_THEMES.find((t) => t.id === currentTheme) || BOARD_THEMES[0];

  return (
    <div className="theme-selector">
      <button
        className="btn-ghost theme-trigger"
        onClick={() => setIsOpen(!isOpen)}
        disabled={pending}
      >
        🎨 {selectedTheme.name}
      </button>

      {isOpen && (
        <div className="theme-menu">
          {BOARD_THEMES.map((theme) => (
            <button
              key={theme.id}
              className="theme-option"
              onClick={() => handleSelect(theme.id)}
              disabled={pending}
              data-selected={theme.id === selectedTheme.id}
            >
              <div className="theme-preview">
                <div
                  className="theme-square"
                  style={{ backgroundColor: theme.lightSquare }}
                />
                <div
                  className="theme-square"
                  style={{ backgroundColor: theme.darkSquare }}
                />
              </div>
              <span>{theme.name}</span>
            </button>
          ))}
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}
