'use client';

import { useMemo, useState } from 'react';
import { Chip, WinRateBar, formatPct } from './ui';
import { HeroAvatar, useHeroModal } from './HeroModal';
import { PlayerAvatar, PlayerLink, usePlayerModal } from './PlayerModal';
import type { DetailedRecord } from '@/lib/types';

/**
 * Leaderboard table for players or heroes.
 *
 * There is exactly ONE modal per entity in the whole app: clicking a hero
 * opens the global hero modal, clicking a player opens the global player
 * modal. This table therefore has no drill-down of its own — it only routes
 * the click to the global modals.
 *
 * `layout="split"` renders two column groups — "1 vs 1" and "2 vs 2" — each
 * with its own games / wins / losses / win-rate, separated by a vertical
 * divider. `layout="combined"` (the default) keeps the single set of totals
 * used by the players table.
 */
export function EntityTable({
  records,
  kind,
  emptyMessage,
  layout = 'combined',
}: {
  records: DetailedRecord[];
  kind: 'player' | 'hero';
  emptyMessage: string;
  layout?: 'combined' | 'split';
}) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'games' | 'winRate' | 'name'>('games');

  // The one and only modals of the app.
  const { openHero } = useHeroModal();
  const { openPlayer } = usePlayerModal();

  const open = (record: DetailedRecord) => {
    if (kind === 'hero') openHero(record.name);
    else openPlayer(record.name);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? records.filter((r) => r.name.toLowerCase().includes(q))
      : records;
    return [...list].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'ru');
      if (sortBy === 'winRate') return b.winRate - a.winRate || b.games - a.games;
      return b.games - a.games;
    });
  }, [records, query, sortBy]);

  if (records.length === 0) {
    return <p className="py-10 text-center text-sm text-parch-500">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="field max-w-xs"
          placeholder={kind === 'player' ? 'Поиск игрока…' : 'Поиск героя…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
          {(
            [
              ['games', 'Игры'],
              ['winRate', 'Винрейт'],
              ['name', 'А–Я'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className="tab-btn px-2.5 py-1 text-xs"
              data-active={sortBy === key}
              onClick={() => setSortBy(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        {layout === 'split' ? (
          <SplitTable filtered={filtered} kind={kind} onSelect={open} />
        ) : (
          <CombinedTable filtered={filtered} kind={kind} onSelect={open} />
        )}
      </div>
    </>
  );
}

/** Vertical divider between the "1 vs 1" and "2 vs 2" column groups. */
const DIVIDER = 'border-l border-ink-700';

/** Shared cell styling for the numeric columns. */
function numCell(value: number | string, tone = 'text-parch-300') {
  return `py-2 pr-3 text-right tabular-nums ${tone}`;
}

/**
 * Split layout: one column group per mode, with a vertical divider between
 * them. Heroes use this so that 1 vs 1 and 2 vs 2 results can be read side
 * by side instead of being mixed into a single average.
 */
function SplitTable({
  filtered,
  kind,
  onSelect,
}: {
  filtered: DetailedRecord[];
  kind: 'player' | 'hero';
  onSelect: (record: DetailedRecord) => void;
}) {
  return (
    <table className="w-full min-w-[880px] border-collapse text-sm">
      <thead>
        <tr className="border-b border-ink-700 text-left">
          <th className="stat-label py-2 pr-3" rowSpan={2}>
            #
          </th>
          <th className="stat-label py-2 pr-3" rowSpan={2}>
            Герой
          </th>
          <th
            className="stat-label border-y border-ink-700 bg-ink-850/60 py-1.5 text-center text-azure-300"
            colSpan={4}
          >
            1 vs 1
          </th>
          <th
            className="stat-label border-y border-l border-ink-700 bg-ink-850/60 py-1.5 text-center text-gold-300"
            colSpan={4}
          >
            2 vs 2
          </th>
        </tr>
        <tr className="border-b border-ink-700 text-left">
          <th className="stat-label py-2 pr-3 text-right">Игры</th>
          <th className="stat-label py-2 pr-3 text-right">Побед</th>
          <th className="stat-label py-2 pr-3 text-right">Пораж.</th>
          <th className="stat-label py-2 pr-3 text-right">Винрейт</th>
          <th className={`stat-label ${DIVIDER} py-2 pr-3 text-right`}>Игры</th>
          <th className="stat-label py-2 pr-3 text-right">Побед</th>
          <th className="stat-label py-2 pr-3 text-right">Пораж.</th>
          <th className="stat-label py-2 pr-3 text-right">Винрейт</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((record, index) => (
          <tr
            key={record.name}
            onClick={() => onSelect(record)}
            title={kind === 'hero' ? 'Открыть профиль героя' : 'Открыть профиль игрока'}
            className="cursor-pointer border-b border-ink-800/70 transition-colors hover:bg-ink-800/40"
          >
            <td className="py-2 pr-3 text-xs text-parch-600">{index + 1}</td>
            <td className="py-2 pr-3">
              <div className="flex items-center gap-2.5">
                {kind === 'hero' ? (
                  <HeroAvatar name={record.name} image={record.image} size={30} />
                ) : (
                  <PlayerAvatar name={record.name} image={record.image} size={30} />
                )}
                {kind === 'hero' ? (
                  <span className="font-medium text-parch-100">{record.name}</span>
                ) : (
                  <PlayerLink
                    name={record.name}
                    className="font-medium text-parch-100"
                  />
                )}
              </div>
            </td>
            <td className={numCell(record.games1v1)}>{record.games1v1 || '—'}</td>
            <td className={numCell(record.wins1v1, 'text-emerald-400')}>{record.wins1v1 || '—'}</td>
            <td className={numCell(record.losses1v1, 'text-crimson-400')}>
              {record.losses1v1 || '—'}
            </td>
            <td className="py-2 pr-3 text-right">
              {record.games1v1 > 0 ? (
                <span className="text-xs font-semibold tabular-nums text-parch-100">
                  {formatPct(record.winRate1v1)}
                </span>
              ) : (
                <span className="text-xs text-parch-600">—</span>
              )}
            </td>
            <td className={`${numCell(record.games2v2)} ${DIVIDER}`}>
              {record.games2v2 || '—'}
            </td>
            <td className={numCell(record.wins2v2, 'text-emerald-400')}>{record.wins2v2 || '—'}</td>
            <td className={numCell(record.losses2v2, 'text-crimson-400')}>
              {record.losses2v2 || '—'}
            </td>
            <td className="py-2 pr-3 text-right">
              {record.games2v2 > 0 ? (
                <span className="text-xs font-semibold tabular-nums text-parch-100">
                  {formatPct(record.winRate2v2)}
                </span>
              ) : (
                <span className="text-xs text-parch-600">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Original single-group layout, used by the players table. */
function CombinedTable({
  filtered,
  kind,
  onSelect,
}: {
  filtered: DetailedRecord[];
  kind: 'player' | 'hero';
  onSelect: (record: DetailedRecord) => void;
}) {
  return (
    <table className="w-full min-w-[720px] border-collapse text-sm">
      <thead>
        <tr className="border-b border-ink-700 text-left">
          <th className="stat-label py-2 pr-3">#</th>
          <th className="stat-label py-2 pr-3">{kind === 'player' ? 'Игрок' : 'Герой'}</th>
          <th className="stat-label py-2 pr-3 text-right">Игры</th>
          <th className="stat-label py-2 pr-3 text-right">Побед</th>
          <th className="stat-label py-2 pr-3 text-right">Пораж.</th>
          <th className="stat-label py-2 pr-3 text-right">1v1</th>
          <th className="stat-label py-2 pr-3 text-right">2v2</th>
          <th className="stat-label w-40 py-2 pr-3">Винрейт</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((record, index) => (
          <tr
            key={record.name}
            onClick={() => onSelect(record)}
            title={kind === 'hero' ? 'Открыть профиль героя' : 'Открыть профиль игрока'}
            className="cursor-pointer border-b border-ink-800/70 transition-colors hover:bg-ink-800/40"
          >
            <td className="py-2 pr-3 text-xs text-parch-600">{index + 1}</td>
            <td className="py-2 pr-3">
              <div className="flex items-center gap-2.5">
                {kind === 'hero' ? (
                  <HeroAvatar name={record.name} image={record.image} size={30} />
                ) : (
                  <PlayerAvatar name={record.name} image={record.image} size={30} />
                )}
                {kind === 'hero' ? (
                  <span className="font-medium text-parch-100">{record.name}</span>
                ) : (
                  <PlayerLink
                    name={record.name}
                    className="font-medium text-parch-100"
                  />
                )}
                {record.dualGames > 0 ? (
                  <Chip tone="violet" title="Матчи, где игрок вёл сразу двух героев">
                    2 героя
                  </Chip>
                ) : null}
              </div>
            </td>
            <td className={numCell(record.games)}>{record.games}</td>
            <td className={numCell(record.wins, 'text-emerald-400')}>{record.wins}</td>
            <td className={numCell(record.losses, 'text-crimson-400')}>{record.losses}</td>
            <td className={numCell(record.games1v1, 'text-xs text-parch-500')}>
              {record.games1v1 || '—'}
            </td>
            <td className={numCell(record.games2v2, 'text-xs text-parch-500')}>
              {record.games2v2 || '—'}
            </td>
            <td className="py-2 pr-3">
              <div className="flex items-center gap-2">
                <WinRateBar value={record.winRate} className="flex-1" />
                <span className="w-14 text-right text-xs tabular-nums font-semibold text-parch-100">
                  {formatPct(record.winRate)}
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
