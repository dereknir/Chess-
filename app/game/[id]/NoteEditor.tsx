'use client';

import { useState, useTransition } from 'react';
import { updateGameNote } from '@/app/actions';

type Props = {
  gameId: number;
  initialNote: string | null;
};

export default function NoteEditor({ gameId, initialNote }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [note, setNote] = useState(initialNote || '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await updateGameNote(gameId, note);
      if (res.ok) {
        setIsEditing(false);
      } else {
        setError(res.message);
      }
    });
  }

  function handleCancel() {
    setNote(initialNote || '');
    setIsEditing(false);
    setError(null);
  }

  if (isEditing) {
    return (
      <div className="note-editor">
        <label htmlFor="note-input" className="note-label">
          棋局備註
        </label>
        <textarea
          id="note-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="記錄這局的想法、開局名稱、紀念意義等…"
          rows={3}
          disabled={pending}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="note-actions">
          <button className="btn" onClick={handleSave} disabled={pending}>
            {pending ? '儲存中…' : '儲存'}
          </button>
          <button
            className="btn-ghost"
            onClick={handleCancel}
            disabled={pending}
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="note-display">
      <div className="note-header">
        <span className="note-label">棋局備註</span>
        <button className="btn-ghost" onClick={() => setIsEditing(true)}>
          {initialNote ? '編輯' : '新增備註'}
        </button>
      </div>
      {initialNote ? (
        <p className="note-content">{initialNote}</p>
      ) : (
        <p className="note-empty">尚無備註</p>
      )}
    </div>
  );
}
