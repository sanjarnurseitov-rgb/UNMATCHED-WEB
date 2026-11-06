'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Chip, Panel, formatDate } from './ui';
import type { AppData } from '@/lib/types';

const PAGE_SIZE = 40;

/** Full match history with search and filters. */
export function HistoryTable({ data }: { data: AppData }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'all' | '1v1' | '2v2'>('all');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.matches
      .filter((m) => (mode === 'all' ? true : m.mode === mode))
      .filter((m) => {
        if (!q) return true;
        return (
          m.players.some((p) => p.toLowerCase().includes(q)) ||
          m.heroes.some((h) => h.toLowerCase().includes(q)) ||
          (m.map ?? '').toLowerCase().includes(q) ||
          (m.comment ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.timestamp && b.timestamp) return b.timestamp.localeCompare(a.timestamp);
        return b.rowNumber - a.rowNumber;
      });
  }, [data.matches, query, mode]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const heroImages = Object.fromEntries(data.reference.heroes.map((h) => [h.name, h.image ?? null]));
  const playerImages = Object.fromEntries(data.reference.players.map((p) => [p.name, p.image ?? null]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="field max-w-xs"
          placeholder="Поиск по игроку, герою, полю…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
          {(
            [
              ['all', 'Все'],
              ['1v1', '1 vs 1'],
              ['2v2', '2 vs 2'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className="tab-btn px-2.5 py-1 text-xs"
              data-active={mode === key}
              onClick={() => {
                setMode(key);
                setPage(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-parch-500">
          Найдено {filtered.length} из {data.matches.length}
        </span>
      </div>

      <Panel title="История матчей" subtitle={`Страница ${safePage + 1} из ${pageCount}`}>
        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-parch-500">Ничего не найдено</p>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left">
                  <th className="stat-label py-2 pr-3">Дата</th>
                  <th className="stat-label py-2 pr-3">Режим</th>
                  <th className="stat-label py-2 pr-3">Участники</th>
                  <th className="stat-label py-2 pr-3">Поле</th>
                  <th className="stat-label py-2 pr-3">Победитель</th>
                  <th className="stat-label py-2 pr-3">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((match) => (
                  <tr
                    key={match.id}
                    className="border-b border-ink-800/70 align-top transition-colors hover:bg-ink-800/40"
                  >
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-parch-500">
                      {formatDate(match.timestamp)}
                    </td>
                    <td className="py-2 pr-3">
                      <Chip tone={match.mode === '1v1' ? 'azure' : 'violet'}>
                        {match.mode === '1v1' ? '1 vs 1' : '2 vs 2'}
                      </Chip>
                    </td>
                    <td className="py-2 pr-3">
                      {match.mode === '1v1' ? (
                        <div className="space-y-1">
                          <Seat
                            player={match.players[0]}
                            hero={match.heroes[0]}
                            images={playerImages}
                            heroImages={heroImages}
                            won={match.winner === 'p1'}
                          />
                          <Seat
                            player={match.players[1]}
                            hero={match.heroes[1]}
                            images={playerImages}
                            heroImages={heroImages}
                            won={match.winner === 'p2'}
                          />
                        </div>
                      ) : (
                        <div className="grid gap-1 sm:grid-cols-2">
                          <div className="space-y-1">
                            {match.team1Players.map((player, index) => (
                              <Seat
                                key={player + index}
                                player={player}
                                hero={match.team1Heroes[index]}
                                images={playerImages}
                                heroImages={heroImages}
                                won={match.winner === 't1'}
                                compact
                              />
                            ))}
                          </div>
                          <div className="space-y-1">
                            {match.team2Players.map((player, index) => (
                              <Seat
                                key={player + index}
                                player={player}
                                hero={match.team2Heroes[index]}
                                images={playerImages}
                                heroImages={heroImages}
                                won={match.winner === 't2'}
                                compact
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-parch-400">{match.map ?? '—'}</td>
                    <td className="py-2 pr-3 text-xs">
                      {match.winner === 'p1'
                        ? match.players[0]
                        : match.winner === 'p2'
                          ? match.players[1]
                          : match.winner === 't1'
                            ? 'Команда 1'
                            : match.winner === 't2'
                              ? 'Команда 2'
                              : '—'}
                    </td>
                    <td className="max-w-[220px] py-2 pr-3 text-xs text-parch-600">
                      {match.comment ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 ? (
          <div className="mt-4 flex items-center justify-between">
            <button
              className="btn btn-ghost"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← Назад
            </button>
            <span className="text-xs text-parch-500">
              {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)}
            </span>
            <button
              className="btn btn-ghost"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Вперёд →
            </button>
          </div>
        ) : null}
      </Panel>

      <button
        className="btn btn-ghost"
        onClick={() => {
          router.refresh();
        }}
      >
        Обновить данные
      </button>
    </div>
  );
}

function Seat({
  player,
  hero,
  images,
  heroImages,
  won,
  compact,
}: {
  player: string;
  hero: string;
  images: Record<string, string | null>;
  heroImages: Record<string, string | null>;
  won: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${compact ? 'text-xs' : ''}`}>
      <span className={won ? 'text-emerald-400' : 'text-crimson-400'}>{won ? '★' : '☆'}</span>
      <Avatar name={player} image={images[player] ?? null} size={20} rounded="rounded" />
      <span className="text-parch-200">{player}</span>
      <span className="text-parch-600">·</span>
      <Avatar name={hero} image={heroImages[hero] ?? null} size={20} rounded="rounded" />
      <span className="text-parch-400">{hero}</span>
    </div>
  );
}
