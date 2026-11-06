'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Chip, EmptyState, Panel, formatDate } from './ui';
import { UNSPECIFIED_MAP, type AppData, type Match } from '@/lib/types';

const PAGE_SIZE = 24;

type View = 'cards' | 'list';

/** Full match history with search, filters and two display modes. */
export function HistoryTable({ data }: { data: AppData }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'all' | '1v1' | '2v2'>('all');
  const [page, setPage] = useState(0);
  const [view, setView] = useState<View>('cards');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

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

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="panel flex flex-wrap items-center gap-2 p-3">
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

        <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
          {(
            [
              ['cards', 'Карточки'],
              ['list', 'Список'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className="tab-btn px-2.5 py-1 text-xs"
              data-active={view === key}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-parch-500">
          Найдено {filtered.length} из {data.matches.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <Panel title="История матчей">
          <EmptyState message="Ничего не найдено" />
        </Panel>
      ) : view === 'cards' ? (
        <div className="space-y-3">
          {visible.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              expanded={expanded.has(match.id)}
              onToggle={() => toggle(match.id)}
              playerImages={playerImages}
              heroImages={heroImages}
            />
          ))}
        </div>
      ) : (
        <Panel title="История матчей" subtitle={`Страница ${safePage + 1} из ${pageCount}`}>
          <ul className="space-y-2">
            {visible.map((match) => (
              <MatchListRow
                key={match.id}
                match={match}
                playerImages={playerImages}
                heroImages={heroImages}
              />
            ))}
          </ul>
        </Panel>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between">
          <button
            className="btn btn-ghost"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← Назад
          </button>
          <span className="text-xs text-parch-500">
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} из{' '}
            {filtered.length}
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

/* -------------------------------------------------------------------------- */

function MatchCard({
  match,
  expanded,
  onToggle,
  playerImages,
  heroImages,
}: {
  match: Match;
  expanded: boolean;
  onToggle: () => void;
  playerImages: Record<string, string | null>;
  heroImages: Record<string, string | null>;
}) {
  const isDuel = match.mode === '1v1';
  const team1Won =
    match.winner === 'p1' || match.winner === 't1';
  const team2Won =
    match.winner === 'p2' || match.winner === 't2';

  const team1Players = isDuel ? [match.players[0]] : match.team1Players;
  const team1Heroes = isDuel ? [match.heroes[0]] : match.team1Heroes;
  const team2Players = isDuel ? [match.players[1]] : match.team2Players;
  const team2Heroes = isDuel ? [match.heroes[1]] : match.team2Heroes;

  return (
    <article className="panel animate-fade-up overflow-hidden p-0">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-4 py-3">
        <span className="text-xs font-semibold text-parch-400">
          {formatDate(match.timestamp)}
        </span>
        <Chip tone={match.mode === '1v1' ? 'azure' : 'violet'}>
          {match.mode === '1v1' ? '1 vs 1' : '2 vs 2'}
        </Chip>
        {team1Won ? (
          <Chip tone="emerald">{isDuel ? 'Победил Игрок 1' : 'Победила команда 1'}</Chip>
        ) : team2Won ? (
          <Chip tone="emerald">{isDuel ? 'Победил Игрок 2' : 'Победила команда 2'}</Chip>
        ) : (
          <Chip tone="crimson">Победитель не указан</Chip>
        )}
        {match.dualControl.map((dual) => (
          <Chip key={`${dual.team}-${dual.player}`} tone="violet">
            1 игрок · 2 героя: {dual.player}
          </Chip>
        ))}
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto flex items-center gap-1 text-xs font-semibold text-parch-500 transition-colors hover:text-gold-300"
          aria-expanded={expanded}
        >
          {expanded ? 'Свернуть' : 'Подробнее'}
          <span className={expanded ? 'rotate-180' : ''}>▾</span>
        </button>
      </header>

      {/* Teams */}
      <div className="grid gap-px bg-ink-800 sm:grid-cols-2">
        <TeamColumn
          title={isDuel ? 'Игрок 1' : 'Команда 1'}
          players={team1Players}
          heroes={team1Heroes}
          won={team1Won}
          playerImages={playerImages}
          heroImages={heroImages}
          dualPlayer={
            match.dualControl.find((d) => d.team === 1)?.player ?? null
          }
        />
        <TeamColumn
          title={isDuel ? 'Игрок 2' : 'Команда 2'}
          players={team2Players}
          heroes={team2Heroes}
          won={team2Won}
          playerImages={playerImages}
          heroImages={heroImages}
          dualPlayer={
            match.dualControl.find((d) => d.team === 2)?.player ?? null
          }
        />
      </div>

      {/* Details */}
      {expanded ? (
        <dl className="grid gap-x-6 gap-y-2 border-t border-ink-800 px-4 py-3 text-xs sm:grid-cols-2">
          <Detail label="Поле боя" value={match.map ?? UNSPECIFIED_MAP} muted={!match.map} />
          <Detail label="Локация" value={match.location ?? '—'} muted={!match.location} />
          <Detail label="Комментарий" value={match.comment ?? '—'} muted={!match.comment} />
          <Detail label="Строка в таблице" value={`№ ${match.rowNumber}`} />
          {!match.valid ? (
            <div className="sm:col-span-2 rounded-lg border border-crimson-600/40 bg-crimson-600/10 px-3 py-2 text-crimson-400">
              Строка не учтена в статистике: {match.issues.join('; ')}
            </div>
          ) : null}
        </dl>
      ) : null}
    </article>
  );
}

function TeamColumn({
  title,
  players,
  heroes,
  won,
  playerImages,
  heroImages,
  dualPlayer,
}: {
  title: string;
  players: string[];
  heroes: string[];
  won: boolean;
  playerImages: Record<string, string | null>;
  heroImages: Record<string, string | null>;
  dualPlayer: string | null;
}) {
  return (
    <div className={`px-4 py-3 ${won ? 'bg-emerald-500/[0.06]' : 'bg-ink-900/40'}`}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`text-[0.7rem] font-bold uppercase tracking-[0.12em] ${
            won ? 'text-emerald-400' : 'text-parch-600'
          }`}
        >
          {title}
        </span>
        {won ? <span className="text-emerald-400">★</span> : null}
        {dualPlayer ? (
          <Chip tone="violet" title="Один игрок вёл обоих героев">
            2 героя
          </Chip>
        ) : null}
      </div>

      <ul className="space-y-1.5">
        {players.map((player, index) => (
          <li key={`${player}-${index}`} className="flex items-center gap-2">
            <Avatar name={player} image={playerImages[player] ?? null} size={26} rounded="rounded-md" />
            <span className="min-w-0 flex-1 truncate text-sm text-parch-100">{player}</span>
            <span className="text-parch-600">·</span>
            <Avatar name={heroes[index] ?? ''} image={heroImages[heroes[index]] ?? null} size={26} rounded="rounded-md" />
            <span className="min-w-0 flex-1 truncate text-sm text-parch-300">
              {heroes[index] ?? '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="stat-label shrink-0">{label}</dt>
      <dd className={`min-w-0 truncate ${muted ? 'text-parch-600' : 'text-parch-200'}`}>
        {value}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function MatchListRow({
  match,
  playerImages,
  heroImages,
}: {
  match: Match;
  playerImages: Record<string, string | null>;
  heroImages: Record<string, string | null>;
}) {
  const isDuel = match.mode === '1v1';
  const team1Won = match.winner === 'p1' || match.winner === 't1';
  const team2Won = match.winner === 'p2' || match.winner === 't2';

  const seats: Array<{ player: string; hero: string; won: boolean }> = isDuel
    ? [
        { player: match.players[0], hero: match.heroes[0], won: team1Won },
        { player: match.players[1], hero: match.heroes[1], won: team2Won },
      ]
    : [
        ...match.team1Players.map((player, index) => ({
          player,
          hero: match.team1Heroes[index],
          won: team1Won,
        })),
        ...match.team2Players.map((player, index) => ({
          player,
          hero: match.team2Heroes[index],
          won: team2Won,
        })),
      ];

  return (
    <li className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-parch-400">
          {formatDate(match.timestamp)}
        </span>
        <Chip tone={match.mode === '1v1' ? 'azure' : 'violet'}>
          {match.mode === '1v1' ? '1 vs 1' : '2 vs 2'}
        </Chip>
        {match.dualControl.length > 0 ? (
          <Chip tone="violet">
            1 игрок · 2 героя: {match.dualControl.map((d) => d.player).join(', ')}
          </Chip>
        ) : null}
        <span className="ml-auto text-xs text-parch-600">
          {match.map ?? UNSPECIFIED_MAP}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {seats.map((seat, index) => (
          <span key={`${seat.player}-${index}`} className="flex items-center gap-1.5 text-xs">
            <span className={seat.won ? 'text-emerald-400' : 'text-crimson-400'}>
              {seat.won ? '★' : '☆'}
            </span>
            <Avatar name={seat.player} image={playerImages[seat.player] ?? null} size={18} rounded="rounded" />
            <span className="text-parch-200">{seat.player}</span>
            <span className="text-parch-600">·</span>
            <Avatar name={seat.hero} image={heroImages[seat.hero] ?? null} size={18} rounded="rounded" />
            <span className="text-parch-400">{seat.hero}</span>
          </span>
        ))}
      </div>
      {match.comment ? (
        <p className="mt-1.5 text-xs italic text-parch-600">«{match.comment}»</p>
      ) : null}
    </li>
  );
}
