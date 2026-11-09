'use client';

/**
 * Global player modal.
 *
 * Every player avatar and every player name in the app (dashboard tables,
 * synergy lists, match history, matchup matrices) is wrapped in
 * <PlayerAvatar> / <PlayerLink>. Clicking it opens this modal with the full
 * profile of the player.
 *
 * Layout of the modal, in this order:
 *   1. headline statistics + win-rate bar + 1 vs 1 / 2 vs 2 split
 *   2. "Последние матчей" — the most recent matches, newest first
 *   3. "Любимые герои" and "Любимые поля"
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { identityKey, isPlaceholder } from '@/lib/normalize';
import { matchRecency, resultForPlayer } from '@/lib/results';
import type { AppData, DetailedRecord, Match } from '@/lib/types';
import { Avatar, Chip, WinRateBar, formatDate, formatPct } from './ui';
import { HeroAvatar } from './HeroModal';

/* ---------------------------------------------------------------------------
   Context
--------------------------------------------------------------------------- */

interface PlayerModalContextValue {
  openPlayer: (name: string) => void;
  /**
   * Artwork of a player, taken from the IMAGES tab.
   *
   * Every player avatar resolves its picture through this lookup, so a caller
   * never has to remember to pass `image` — that is how images went missing
   * in some blocks before.
   */
  playerImage: (name: string) => string | null;
}

const PlayerModalContext = createContext<PlayerModalContextValue | null>(null);

/**
 * Open the player modal from anywhere inside <PlayerModalProvider>.
 * Outside the provider the call is a no-op, so components stay reusable.
 */
export function usePlayerModal(): PlayerModalContextValue {
  return useContext(PlayerModalContext) ?? { openPlayer: () => {}, playerImage: () => null };
}

/* ---------------------------------------------------------------------------
   Provider
--------------------------------------------------------------------------- */

/** How many of the most recent matches to list. */
export const RECENT_MATCHES_LIMIT = 10;

export function PlayerModalProvider({
  data,
  children,
}: {
  data: AppData;
  children: React.ReactNode;
}) {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const records = useMemo(() => {
    const map = new Map<string, DetailedRecord>();
    for (const record of data.stats.players) {
      map.set(identityKey(record.name), record);
    }
    return map;
  }, [data.stats.players]);

  const selected = selectedName ? records.get(identityKey(selectedName)) ?? null : null;

  /*
   * Artwork lookup. Keyed by the normalized player name so that the different
   * spellings of the same player always resolve to the same picture.
   */
  const playerImages = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of data.reference.players) {
      if (entry.image) map.set(identityKey(entry.name), entry.image);
    }
    return map;
  }, [data.reference.players]);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedName(null);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selected]);

  const value = useMemo<PlayerModalContextValue>(
    () => ({
      openPlayer: (name: string) => setSelectedName(name),
      playerImage: (name: string) => playerImages.get(identityKey(name)) ?? null,
    }),
    [playerImages],
  );

  return (
    <PlayerModalContext.Provider value={value}>
      {children}
      {mounted && selected
        ? createPortal(
            <PlayerModal
              record={selected}
              matches={data.matches}
              heroImages={Object.fromEntries(
                data.reference.heroes.map((h) => [h.name, h.image ?? null]),
              )}
              onClose={() => setSelectedName(null)}
            />,
            document.body,
          )
        : null}
    </PlayerModalContext.Provider>
  );
}

/* ---------------------------------------------------------------------------
   Clickable player avatar / name
--------------------------------------------------------------------------- */

/**
 * A player avatar that opens the player modal when clicked.
 *
 * The click handler stops the event from bubbling, so a player avatar inside
 * a clickable table row opens the player modal and not the row modal.
 */
export function PlayerAvatar({
  name,
  image,
  size = 30,
  rounded = 'rounded-lg',
  className = '',
}: {
  name: string;
  image?: string | null;
  size?: number;
  rounded?: string;
  className?: string;
}) {
  const { openPlayer, playerImage } = usePlayerModal();

  // The caller may pass an explicit picture; otherwise it is looked up in the
  // IMAGES tab, so avatars never silently fall back to a monogram.
  const src = image ?? playerImage(name);

  // An empty player slot renders the plain monogram and is not clickable.
  if (!name.trim()) {
    return <Avatar name={name} image={src} size={size} rounded={rounded} />;
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        openPlayer(name);
      }}
      title={`Подробнее об игроке: ${name}`}
      aria-label={`Подробнее об игроке ${name}`}
      className={`shrink-0 rounded-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${className}`}
    >
      <Avatar name={name} image={src} size={size} rounded={rounded} />
    </button>
  );
}

/** A player name that opens the player modal when clicked. */
export function PlayerLink({
  name,
  className = '',
}: {
  name: string;
  className?: string;
}) {
  const { openPlayer } = usePlayerModal();

  if (!name.trim()) {
    return <span className={className}>{name}</span>;
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        openPlayer(name);
      }}
      title={`Подробнее об игроке: ${name}`}
      className={`text-left transition-colors hover:text-gold-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${className}`}
    >
      {name}
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Recent matches
--------------------------------------------------------------------------- */

interface RecentMatch {
  match: Match;
  result: 'win' | 'loss' | 'draw';
  /** Hero(s) controlled by this player. */
  heroes: string[];
  /** Display names of the opponents. */
  opponents: string[];
}

/**
 * The most recent matches of a player, newest first.
 *
 * Computed on the client from the raw match list, so no extra data has to be
 * shipped to the browser.
 */
export function recentMatchesFor(
  matches: Match[],
  playerName: string,
  limit = RECENT_MATCHES_LIMIT,
): RecentMatch[] {
  const key = identityKey(playerName);
  const out: RecentMatch[] = [];

  for (const match of matches) {
    if (!match.valid) continue;

    const seats = match.players
      .map((player, seat) => ({ player, seat }))
      .filter((entry) => entry.player && !isPlaceholder(entry.player))
      .filter((entry) => identityKey(entry.player) === key)
      .map((entry) => entry.seat);
    if (seats.length === 0) continue;

    const result = resultForPlayer(match, playerName);
    if (!result) continue;

    const ownSeats = new Set(seats);
    const heroes = seats.map((seat) => match.heroes[seat] ?? '');
    const opponents: string[] = [];
    match.players.forEach((player, seat) => {
      if (ownSeats.has(seat)) return;
      if (!player || isPlaceholder(player)) return;
      if (!opponents.includes(player)) opponents.push(player);
    });

    out.push({ match, result, heroes, opponents });
  }

  out.sort((a, b) => matchRecency(b.match) - matchRecency(a.match));
  return out.slice(0, limit);
}

/* ---------------------------------------------------------------------------
   The modal itself
--------------------------------------------------------------------------- */

function PlayerModal({
  record,
  matches,
  heroImages,
  onClose,
}: {
  record: DetailedRecord;
  matches: Match[];
  heroImages: Record<string, string | null>;
  onClose: () => void;
}) {
  const { playerImage } = usePlayerModal();
  const recent = useMemo(
    () => recentMatchesFor(matches, record.name),
    [matches, record.name],
  );

  return (
    <>
      <div className="modal-overlay bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="modal-panel panel modal-animated"
        role="dialog"
        aria-modal="true"
        aria-label={`${record.name} — профиль игрока`}
      >
        <header className="flex items-start gap-3 border-b border-ink-700 p-5">
          <Avatar name={record.name} image={record.image ?? playerImage(record.name)} size={56} rounded="rounded-xl" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-[family-name:var(--font-display)] text-lg font-bold text-parch-100">
              {record.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Chip tone="gold">{record.games} матчей</Chip>
              <Chip tone={record.winRate >= 0.5 ? 'emerald' : 'crimson'}>
                винрейт {formatPct(record.winRate)}
              </Chip>
              {record.dualGames > 0 ? (
                <Chip tone="violet" title="Матчи, где игрок управлял двумя героями">
                  двойной контроль × {record.dualGames}
                </Chip>
              ) : null}
            </div>
          </div>
          <button className="btn btn-ghost px-2.5 py-1.5" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <div className="space-y-4 p-5">
          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Винрейт" value={formatPct(record.winRate)} tone="text-gold-400" />
            <Stat label="Победы" value={record.wins} tone="text-emerald-400" />
            <Stat label="Поражения" value={record.losses} tone="text-crimson-400" />
            <Stat
              label="Любимых героев"
              value={record.topHeroes.length}
              tone="text-azure-400"
              hint="Сколько разных героев играл игрок"
            />
          </div>

          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="flex items-center gap-2">
              <WinRateBar value={record.winRate} className="flex-1" />
              <span className="text-sm font-bold tabular-nums text-parch-100">
                {formatPct(record.winRate)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="stat-label">1 vs 1</p>
                <p className="mt-0.5 text-parch-200">
                  {record.games1v1} игр · винрейт{' '}
                  <span className="font-semibold text-parch-100">
                    {record.games1v1 > 0 ? formatPct(record.winRate1v1) : '—'}
                  </span>
                </p>
              </div>
              <div>
                <p className="stat-label">2 vs 2</p>
                <p className="mt-0.5 text-parch-200">
                  {record.games2v2} игр · винрейт{' '}
                  <span className="font-semibold text-parch-100">
                    {record.games2v2 > 0 ? formatPct(record.winRate2v2) : '—'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Recent matches — placed before the favourite hero/map sections. */}
          <section>
            <p className="stat-label">Последние {recent.length} матчей</p>
            {recent.length === 0 ? (
              <p className="mt-2 text-xs text-parch-500">Нет матчей с зафиксированным победителем</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {recent.map((item) => (
                  <li
                    key={item.match.id}
                    className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5"
                  >
                    <span
                      className={`w-1.5 shrink-0 self-stretch rounded-full ${
                        item.result === 'win'
                          ? 'bg-emerald-500'
                          : item.result === 'loss'
                            ? 'bg-crimson-500'
                            : 'bg-ink-500'
                      }`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-parch-200">
                        {item.heroes.map((hero, index) => (
                          <span key={`${hero}-${index}`}>
                            <HeroAvatar
                              name={hero}
                              image={heroImages[hero] ?? null}
                              size={18}
                              rounded="rounded-md"
                              className="mx-0.5 inline-flex align-middle"
                            />
                            {hero}
                            {index < item.heroes.length - 1 ? ' + ' : ''}
                          </span>
                        ))}
                      </p>
                      <p className="truncate text-[11px] text-parch-500">
                        vs{' '}
                        {item.opponents.length === 0
                          ? '—'
                          : item.opponents.map((opponent, index) => (
                              <span key={opponent}>
                                <PlayerLink name={opponent} className="text-parch-500" />
                                {index < item.opponents.length - 1 ? ', ' : ''}
                              </span>
                            ))}
                        {item.match.map ? ` · ${item.match.map}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className={`text-xs font-bold uppercase ${
                          item.result === 'win'
                            ? 'text-emerald-400'
                            : item.result === 'loss'
                              ? 'text-crimson-400'
                              : 'text-parch-400'
                        }`}
                      >
                        {item.result === 'win' ? 'победа' : item.result === 'loss' ? 'поражение' : 'ничья'}
                      </span>
                      <p className="text-[11px] text-parch-500">{formatDate(item.match.timestamp)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Favourite heroes and maps */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <p className="stat-label">Любимые герои</p>
              {record.topHeroes.length === 0 ? (
                <p className="mt-2 text-xs text-parch-500">Нет данных</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {record.topHeroes.slice(0, 5).map((hero) => (
                    <li key={hero.name} className="flex items-center gap-2">
                      <HeroAvatar
                        name={hero.name}
                        image={heroImages[hero.name] ?? null}
                        size={22}
                        rounded="rounded-md"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-parch-200">
                        {hero.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-parch-400">
                        {hero.games} игр
                      </span>
                      <span
                        className={`shrink-0 text-xs font-semibold tabular-nums ${
                          hero.winRate >= 0.5 ? 'text-emerald-400' : 'text-crimson-400'
                        }`}
                      >
                        {formatPct(hero.winRate)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <p className="stat-label">Любимые поля</p>
              {record.topMaps.length === 0 ? (
                <p className="mt-2 text-xs text-parch-500">Нет данных</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {record.topMaps.slice(0, 5).map((map) => (
                    <li key={map.name} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-parch-200">
                        {map.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-parch-400">
                        {map.games} игр
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 p-3 text-center" title={hint}>
      <p className="stat-label">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
