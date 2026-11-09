'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar, Chip, WinRateBar, formatPct } from './ui';
import { HeroAvatar } from './HeroModal';
import { PlayerAvatar, PlayerLink } from './PlayerModal';
import type { DetailedRecord } from '@/lib/types';

/**
 * Leaderboard table for players or heroes, with a drill-down modal that
 * shows the entry's favourite heroes / maps.
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
  const [selected, setSelected] = useState<DetailedRecord | null>(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'games' | 'winRate' | 'name'>('games');
  const [mounted, setMounted] = useState(false);

  // The modal is rendered into <body> through a portal, so it can never be
  // offset by a transformed ancestor (the fade-up animation on the panel).
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selected]);

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
          <SplitTable filtered={filtered} kind={kind} onSelect={setSelected} />
        ) : (
          <CombinedTable filtered={filtered} kind={kind} onSelect={setSelected} />
        )}
      </div>

      {mounted && selected
        ? createPortal(
            <EntityModal record={selected} kind={kind} onClose={() => setSelected(null)} />,
            document.body,
          )
        : null}
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
            title="Открыть подробности"
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
            title="Открыть подробности"
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

/**
 * Detail modal.
 *
 * Positioning: the backdrop covers the viewport, and the panel itself is
 * `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%)`
 * so it is always centred in the viewport the user is looking at — even when
 * the table sits far down a long page.
 */
function EntityModal({
  record,
  kind,
  onClose,
}: {
  record: DetailedRecord;
  kind: 'player' | 'hero';
  onClose: () => void;
}) {
  const wr1v1 = record.games1v1 > 0 ? record.wins1v1 / record.games1v1 : null;
  const wr2v2 = record.games2v2 > 0 ? record.wins2v2 / record.games2v2 : null;

  return (
    <>
      <div className="modal-overlay bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="modal-panel panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${record.name} — подробности`}
      >
        <header className="sticky top-0 flex items-start gap-3 border-b border-ink-700 bg-ink-850/95 p-5 backdrop-blur">
          <Avatar name={record.name} image={record.image} size={52} rounded="rounded-xl" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-[family-name:var(--font-display)] text-lg font-bold text-parch-100">
              {record.name}
            </h3>
            <p className="text-xs text-parch-500">
              {kind === 'player' ? 'Игрок' : 'Герой'} · {record.games} матчей
            </p>
          </div>
          <button className="btn btn-ghost px-2.5 py-1.5" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Победы" value={record.wins} tone="text-emerald-400" />
            <Stat label="Поражения" value={record.losses} tone="text-crimson-400" />
            <Stat label="Винрейт" value={formatPct(record.winRate)} tone="text-gold-400" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <p className="stat-label">1 vs 1</p>
              <p className="mt-1 text-lg font-bold text-parch-100">
                {record.games1v1}{' '}
                <span className="text-xs font-normal text-parch-500">матчей</span>
              </p>
              {wr1v1 !== null ? (
                <p className="mt-0.5 text-xs text-gold-400">Винрейт {formatPct(wr1v1)}</p>
              ) : null}
            </div>
            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <p className="stat-label">2 vs 2</p>
              <p className="mt-1 text-lg font-bold text-parch-100">
                {record.games2v2}{' '}
                <span className="text-xs font-normal text-parch-500">матчей</span>
              </p>
              {wr2v2 !== null ? (
                <p className="mt-0.5 text-xs text-gold-400">Винрейт {formatPct(wr2v2)}</p>
              ) : null}
            </div>
          </div>

          {record.dualGames > 0 ? (
            <div className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2.5">
              <p className="text-xs text-violet-400">
                В <b>{record.dualGames}</b> матчах игрок вёл сразу двух героев против двух
                соперников. Такой матч засчитывается один раз, а оба героя засчитываются за
                игрока.
              </p>
            </div>
          ) : null}

          {record.topHeroes.length > 0 && kind === 'player' ? (
            <div>
              <p className="stat-label mb-2">Любимые герои</p>
              <ul className="space-y-1.5">
                {record.topHeroes.map((hero) => (
                  <li
                    key={hero.name}
                    className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-900 px-3 py-2"
                  >
                    <span className="text-sm text-parch-100">{hero.name}</span>
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-parch-500">{hero.games} игр</span>
                      <Chip tone={hero.winRate >= 0.5 ? 'emerald' : 'crimson'}>
                        {formatPct(hero.winRate)}
                      </Chip>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {record.topMaps.length > 0 ? (
            <div>
              <p className="stat-label mb-2">Любимые поля</p>
              <ul className="space-y-1.5">
                {record.topMaps.map((map) => (
                  <li
                    key={map.name}
                    className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-900 px-3 py-2"
                  >
                    <span className="text-sm text-parch-100">{map.name}</span>
                    <span className="text-xs text-parch-500">{map.games} игр</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 p-3 text-center">
      <p className="stat-label">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
