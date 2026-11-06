'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Chip, Panel } from './ui';
import type { AppData, GameMode } from '@/lib/types';

type Winner = 'p1' | 'p2' | 't1' | 't2';

const SEAT_LABELS: Record<GameMode, string[]> = {
  '1v1': ['Игрок 1', 'Игрок 2'],
  '2v2': ['Команда 1 · Игрок 1', 'Команда 1 · Игрок 2', 'Команда 2 · Игрок 3', 'Команда 2 · Игрок 4'],
};

export function MatchForm({ data }: { data: AppData }) {
  const router = useRouter();
  const [mode, setMode] = useState<GameMode>('1v1');
  const [players, setPlayers] = useState<string[]>(['', '', '', '']);
  const [heroes, setHeroes] = useState<string[]>(['', '', '', '']);
  const [map, setMap] = useState('');
  const [winner, setWinner] = useState<Winner>('p1');
  const [comment, setComment] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const seatCount = mode === '1v1' ? 2 : 4;

  const heroImages = useMemo(
    () => Object.fromEntries(data.reference.heroes.map((h) => [h.name, h.image ?? null])),
    [data.reference.heroes],
  );
  const playerImages = useMemo(
    () => Object.fromEntries(data.reference.players.map((p) => [p.name, p.image ?? null])),
    [data.reference.players],
  );

  const maps = useMemo(
    () => data.reference.maps.filter((m) => m.mode === mode),
    [data.reference.maps, mode],
  );

  // --- validation ---------------------------------------------------------
  const errors: string[] = [];
  for (let i = 0; i < seatCount; i += 1) {
    if (!players[i]) errors.push(`Не выбран игрок: ${SEAT_LABELS[mode][i]}`);
    if (!heroes[i]) errors.push(`Не выбран герой: ${SEAT_LABELS[mode][i]}`);
  }
  const selectedHeroes = heroes.slice(0, seatCount).filter(Boolean);
  const duplicateHeroes = selectedHeroes.filter(
    (hero, index) => selectedHeroes.indexOf(hero) !== index,
  );
  if (duplicateHeroes.length > 0) {
    errors.push(`Герой «${duplicateHeroes[0]}» выбран дважды — так нельзя`);
  }
  if (!map) errors.push('Не выбрано поле боя');

  const canSubmit = errors.length === 0 && data.meta.canWrite && !submitting;

  function resetForm() {
    setPlayers(['', '', '', '']);
    setHeroes(['', '', '', '']);
    setMap('');
    setWinner(mode === '1v1' ? 'p1' : 't1');
    setComment('');
    setLocation('');
  }

  function switchMode(next: GameMode) {
    setMode(next);
    setWinner(next === '1v1' ? 'p1' : 't1');
    setMap('');
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (errors.length > 0) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          players: players.slice(0, seatCount),
          heroes: heroes.slice(0, seatCount),
          map: map || null,
          winner,
          comment: comment || null,
          location: location || null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Не удалось сохранить матч');
        if (Array.isArray(payload.issues)) {
          setError(
            payload.issues.map((i: { message: string }) => i.message).join('; ') ||
              payload.error,
          );
        }
        return;
      }

      setSuccess('Матч записан в таблицу');
      resetForm();
      router.refresh();
    } catch {
      setError('Сеть недоступна. Проверьте подключение.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode */}
          <Panel title="Режим игры">
            <div className="grid grid-cols-2 gap-3">
              {(['1v1', '2v2'] as GameMode[]).map((item) => {
                const active = mode === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => switchMode(item)}
                    className={`rounded-xl border px-4 py-3 text-left transition-all ${
                      active
                        ? 'border-gold-500 bg-gold-500/12 shadow-lg shadow-gold-600/10'
                        : 'border-ink-600 bg-ink-900 hover:border-ink-500'
                    }`}
                  >
                    <span
                      className={`block font-[family-name:var(--font-display)] text-lg font-bold ${
                        active ? 'text-gold-300' : 'text-parch-300'
                      }`}
                    >
                      {item === '1v1' ? '1 vs 1' : '2 vs 2'}
                    </span>
                    <span className="mt-0.5 block text-xs text-parch-500">
                      {item === '1v1'
                        ? 'Два игрока, по одному герою'
                        : 'Две команды по два игрока'}
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* Seats */}
          <Panel title="Участники" subtitle="Один и тот же герой нельзя выбрать дважды">
            <div className="space-y-3">
              {Array.from({ length: seatCount }).map((_, index) => {
                const isTeam2 = mode === '2v2' && index >= 2;
                return (
                  <div
                    key={index}
                    className={`rounded-xl border p-3 ${
                      isTeam2 ? 'border-crimson-600/30 bg-crimson-600/5' : 'border-azure-600/30 bg-azure-600/5'
                    }`}
                  >
                    <p className="stat-label mb-2">
                      {SEAT_LABELS[mode][index]}
                      {mode === '2v2' ? (
                        <span className="ml-2 normal-case tracking-normal">
                          {isTeam2 ? 'Команда 2' : 'Команда 1'}
                        </span>
                      ) : null}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                      <label className="block">
                        <span className="mb-1 block text-xs text-parch-500">Игрок</span>
                        <select
                          className="field"
                          value={players[index]}
                          onChange={(e) => {
                            const next = [...players];
                            next[index] = e.target.value;
                            setPlayers(next);
                          }}
                        >
                          <option value="">— выбрать —</option>
                          {data.reference.players.map((player) => (
                            <option key={player.name} value={player.name}>
                              {player.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs text-parch-500">Герой</span>
                        <select
                          className="field"
                          value={heroes[index]}
                          onChange={(e) => {
                            const next = [...heroes];
                            next[index] = e.target.value;
                            setHeroes(next);
                          }}
                        >
                          <option value="">— выбрать —</option>
                          {data.reference.heroes.map((hero) => {
                            const takenByOther =
                              heroes[index] !== hero.name &&
                              heroes.slice(0, seatCount).some((h, i) => i !== index && h === hero.name);
                            return (
                              <option key={hero.name} value={hero.name} disabled={takenByOther}>
                                {hero.name}
                                {hero.homebrew ? ' ★' : ''}
                                {takenByOther ? ' — уже выбран' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </label>

                      <div className="flex items-end pb-1">
                        <div className="flex items-center gap-2">
                          {heroes[index] ? (
                            <Avatar
                              name={heroes[index]}
                              image={heroImages[heroes[index]] ?? null}
                              size={36}
                            />
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-ink-600 text-parch-600">
                              ?
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Map + winner */}
          <Panel title="Поле боя и победитель">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-parch-500">
                  Поле боя {mode === '1v1' ? '(1 vs 1)' : '(2 vs 2)'}
                </span>
                <select className="field" value={map} onChange={(e) => setMap(e.target.value)}>
                  <option value="">— выбрать —</option>
                  {maps.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-1 block text-xs text-parch-500">Победитель</span>
                <div className="grid grid-cols-2 gap-2">
                  {(mode === '1v1'
                    ? (['p1', 'p2'] as Winner[])
                    : (['t1', 't2'] as Winner[])
                  ).map((option) => {
                    const label =
                      mode === '1v1'
                        ? option === 'p1'
                          ? 'Игрок 1'
                          : 'Игрок 2'
                        : option === 't1'
                          ? 'Команда 1'
                          : 'Команда 2';
                    const active = winner === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setWinner(option)}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-all ${
                          active
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                            : 'border-ink-600 bg-ink-900 text-parch-400 hover:border-ink-500'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs text-parch-500">Комментарий (необязательно)</span>
                <input
                  className="field"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Например: узкий перевес"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-parch-500">Локация (необязательно)</span>
                <input
                  className="field"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Например: ай квест"
                />
              </label>
            </div>
          </Panel>

          {/* Submit */}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-gold" disabled={!canSubmit}>
              {submitting ? 'Сохраняем…' : 'Записать матч'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Очистить
            </button>
            {!data.meta.canWrite ? (
              <Chip tone="crimson">Запись недоступна: нет сервисного аккаунта</Chip>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-lg border border-crimson-600/40 bg-crimson-600/10 px-4 py-3 text-sm text-crimson-400">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-400">
              {success}
            </div>
          ) : null}
        </form>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <Panel title="Проверка">
          {errors.length === 0 ? (
            <p className="text-sm text-emerald-400">✓ Всё заполнено корректно</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-crimson-400">
              {errors.map((message) => (
                <li key={message}>• {message}</li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Справка" subtitle="Что записывается в таблицу">
          <div className="space-y-3 text-xs text-parch-500">
            <div>
              <p className="stat-label mb-1">1 vs 1</p>
              <p>
                Колонки C–J: игроки, герои, поле, победитель, комментарий, локация.
              </p>
            </div>
            <div>
              <p className="stat-label mb-1">2 vs 2</p>
              <p>Колонки K–V: поле, две команды по два игрока с героями, победитель.</p>
            </div>
            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <p className="mb-1 text-parch-400">
                ★ — персонаж из раздела «фан персы игранные», он добавлен вручную.
              </p>
              <p>
                Список игроков и героев формируется из таблицы <b>PlayerList</b> и из самой
                истории матчей, поэтому в выпадающих списках есть и те, кого в справочник не
                вносили.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
