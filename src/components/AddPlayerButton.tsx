'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * "Добавить игрока" button + modal.
 *
 * New players are appended to column C of the `PlayerList` sheet, which is the
 * same list the match form reads its dropdown from. In read-only mode (no
 * service account configured) the API answers with 503 and the modal explains
 * what to do instead of failing silently.
 */
export function AddPlayerButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setName('');
    setError(null);
    setStatus('idle');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) {
      setError('Введите имя игрока');
      return;
    }
    setStatus('saving');
    setError(null);
    try {
      const response = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'player', name: value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus('idle');
        setError(payload?.error ?? 'Не удалось добавить игрока');
        return;
      }
      setStatus('done');
      // Let the sheet cache expire on the server, then reload so the new
      // player shows up in every dropdown.
      setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch {
      setStatus('idle');
      setError('Сеть недоступна. Проверьте соединение и попробуйте ещё раз.');
    }
  };

  return (
    <>
      <button className="btn btn-ghost border-ink-600" onClick={() => setOpen(true)}>
        <span className="text-gold-400">+</span>
        <span className="hidden sm:inline">Добавить игрока</span>
        <span className="sm:hidden">Игрок</span>
      </button>

      {open
        ? createPortal(
            <AddPlayerModal
              name={name}
              setName={setName}
              status={status}
              error={error}
              onSubmit={submit}
              onClose={close}
            />,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * The modal is rendered into <body> through a portal, so it is always centred
 * in the viewport the user is looking at.
 */
function AddPlayerModal({
  name,
  setName,
  status,
  error,
  onSubmit,
  onClose,
}: {
  name: string;
  setName: (value: string) => void;
  status: 'idle' | 'saving' | 'done';
  error: string | null;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <>
      <div className="modal-overlay bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="modal-panel panel animate-fade-up"
        role="dialog"
        aria-modal="true"
        aria-label="Добавить игрока"
      >
        <header className="flex items-start gap-3 border-b border-ink-700 p-5">
          <div className="min-w-0 flex-1">
            <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-parch-100">
              Новый игрок
            </h3>
            <p className="mt-0.5 text-xs text-parch-500">
              Имя будет добавлено в список игроков таблицы и станет доступно в форме матча.
            </p>
          </div>
          <button className="btn btn-ghost px-2.5 py-1.5" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <form className="space-y-4 p-5" onSubmit={onSubmit}>
          <div>
            <label className="stat-label mb-1.5 block" htmlFor="new-player-name">
              Имя игрока
            </label>
            <input
              id="new-player-name"
              ref={inputRef}
              className="field w-full"
              placeholder="Например: Алиса"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              disabled={status === 'saving' || status === 'done'}
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-crimson-600/40 bg-crimson-600/10 px-3 py-2 text-xs text-crimson-400">
              {error}
            </p>
          ) : null}

          {status === 'done' ? (
            <p className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-xs text-emerald-400">
              Игрок добавлен. Обновляем таблицу…
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-ghost border-ink-600" onClick={onClose}>
              Отмена
            </button>
            <button
              type="submit"
              className="btn btn-gold"
              disabled={status === 'saving' || status === 'done'}
            >
              {status === 'saving' ? 'Сохраняем…' : 'Добавить'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
