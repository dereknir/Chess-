'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { BOARD_THEMES } from '@/lib/themes';
import { updateBoardTheme } from './actions';

type Props = {
  currentTheme: string | null;
};

export default function ThemeSelector({ currentTheme }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // 點擊外部關閉選單
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  function handleSelect(themeId: string) {
    setError(null);
    startTransition(async () => {
      const res = await updateBoardTheme(themeId);
      if (res.ok) {
        setIsOpen(false);
        router.refresh(); // 強制刷新頁面資料
      } else {
        setError(res.message);
      }
    });
  }

  const selectedTheme = BOARD_THEMES.find((t) => t.id === currentTheme) || BOARD_THEMES[0];

  return (
    <div className="theme-selector" ref={menuRef}>
      <button
        className="btn-ghost theme-trigger"
        onClick={() => setIsOpen(!isOpen)}
        disabled={pending}
      >
        🎨 {pending ? '更新中…' : selectedTheme.name}
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
