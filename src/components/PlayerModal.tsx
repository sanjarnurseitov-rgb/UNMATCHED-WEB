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
 *   2. "Последние матчей" — the most recent matches, newest first. Every
 *      match is split into "own side" and "opponents", so the teammate of a
 *      2 vs 2 game is never mixed up with the two opponents.
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

/**
 * One participant of a match together with the hero(s) they controlled.
 *
 * A participant can appear more than once in a 2 vs 2 match: with dual
 * control the same player occupies both seats of a team, so one entry carries
 * both heroes.
 */
export interface LineupEntry {
  /** Display name of the player. */
  name: string;
  /** Heroes controlled by that player. One entry for normal matches. */
  heroes: string[];
  /** True when the player controlled two heroes (dual control). */
  dual: boolean;
}

export interface RecentMatch {
  match: Match;
  result: 'win' | 'loss' | 'draw';
  /** Game mode of the match. */
  mode: '1v1' | '2v2';
  /** Hero(s) controlled by the player themselves. Two in a dual-control match. */
  ownHeroes: string[];
  /** True when the player controlled both heroes of their team. */
  ownDual: boolean;
  /**
   * The teammate in a 2 vs 2 match. Null in 1 vs 1 and in dual-control
   * matches, where the player fills both seats of the team.
   */
  teammate: LineupEntry | null;
  /** Opponents — one entry per opponent player, never the teammate. */
  opponents: LineupEntry[];
}

/**
 * The most recent matches of a player, newest first.
 *
 * The line-up is resolved per match, so a 2 vs 2 game shows the teammate
 * separately from the two opponents instead of listing all three other
 * players side by side.
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

    const ownSeats: number[] = [];
    match.players.forEach((player, seat) => {
      if (!player || isPlaceholder(player)) return;
      if (identityKey(player) === key) ownSeats.push(seat);
    });
    if (ownSeats.length === 0) continue;

    const result = resultForPlayer(match, playerName);
    if (!result) continue;

    const mode: '1v1' | '2v2' = match.mode === '2v2' ? '2v2' : '1v1';
    const heroAt = (seat: number) => (match.heroes[seat] ?? '').trim();

    /*
     * Seat layout: 1 vs 1 — [player, opponent];
     * 2 vs 2 — [t1p1, t1p2, t2p3, t2p4], so seats 0/1 are team 1 and
     * seats 2/3 are team 2.
     */
    const ownTeamSeats = mode === '2v2' ? (ownSeats[0] < 2 ? [0, 1] : [2, 3]) : ownSeats;
    const foeSeats =
      mode === '2v2'
        ? ownSeats[0] < 2
          ? [2, 3]
          : [0, 1]
        : match.players.map((_, seat) => seat).filter((seat) => !ownSeats.includes(seat));

    const ownHeroes = ownSeats.map(heroAt).filter(Boolean);

    // The teammate is the other seat of the own team that the player did not take.
    let teammate: LineupEntry | null = null;
    for (const seat of ownTeamSeats) {
      if (ownSeats.includes(seat)) continue;
      const name = match.players[seat] ?? '';
      if (!name || isPlaceholder(name)) continue;
      const hero = heroAt(seat);
      teammate = { name, heroes: hero ? [hero] : [], dual: false };
    }

    // Opponents — one entry per player, both heroes merged for dual control.
    const opponents: LineupEntry[] = [];
    for (const seat of foeSeats) {
      const name = match.players[seat] ?? '';
      if (!name || isPlaceholder(name)) continue;
      const hero = heroAt(seat);
      const existing = opponents.find((entry) => identityKey(entry.name) === identityKey(name));
      if (existing) {
        if (hero) existing.heroes.push(hero);
        existing.dual = existing.heroes.length > 1;
      } else {
        opponents.push({ name, heroes: hero ? [hero] : [], dual: false });
      }
    }

    out.push({
      match,
      result,
      mode,
      ownHeroes,
      ownDual: ownHeroes.length > 1,
      teammate,
      opponents,
    });
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
                  <RecentMatchRow key={item.match.id} item={item} heroImages={heroImages} />
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

/* ---------------------------------------------------------------------------
   One row of the "recent matches" list
--------------------------------------------------------------------------- */

/** Compact mode badge — `1v1` or `2v2`. */
function ModeBadge({ mode }: { mode: '1v1' | '2v2' }) {
  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
        mode === '2v2'
          ? 'border-violet-500/40 bg-violet-500/15 text-violet-300'
          : 'border-azure-600/40 bg-azure-500/15 text-azure-400'
      }`}
      title={mode === '2v2' ? 'Два на двоих' : 'Один на одного'}
    >
      {mode}
    </span>
  );
}

/**
 * A single match of the recent-matches list.
 *
 * The first line shows the player's own side — own hero(s) and, in 2 vs 2,
 * the teammate. The second line shows the opponents with their heroes and the
 * battlefield. Teammate and opponents never mix, so a 2 vs 2 game no longer
 * looks like a 1 against 3.
 */
function RecentMatchRow({
  item,
  heroImages,
}: {
  item: RecentMatch;
  heroImages: Record<string, string | null>;
}) {
  const bar =
    item.result === 'win'
      ? 'bg-emerald-500'
      : item.result === 'loss'
        ? 'bg-crimson-500'
        : 'bg-ink-500';
  const tone =
    item.result === 'win'
      ? 'text-emerald-400'
      : item.result === 'loss'
        ? 'text-crimson-400'
        : 'text-parch-400';

  return (
    <li className="flex items-start gap-2.5 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2">
      <span className={`w-1.5 shrink-0 self-stretch rounded-full ${bar}`} aria-hidden />

      <div className="min-w-0 flex-1 space-y-1">
        {/* Line 1 — the player's own side. */}
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          <ModeBadge mode={item.mode} />
          {item.ownHeroes.map((hero, index) => (
            <span key={`${hero}-${index}`} className="inline-flex items-center gap-1">
              <HeroAvatar
                name={hero}
                image={heroImages[hero] ?? null}
                size={18}
                rounded="rounded-md"
                className="shrink-0"
              />
              <span className="font-semibold text-parch-100">{hero}</span>
              {index < item.ownHeroes.length - 1 ? (
                <span className="text-parch-500">+</span>
              ) : null}
            </span>
          ))}
          {item.ownDual ? (
            <span
              className="text-[10px] uppercase tracking-wide text-violet-300"
              title="Игрок управлял двумя героями"
            >
              двойной контроль
            </span>
          ) : null}
          {item.teammate ? (
            <>
              <span className="text-parch-500">+</span>
              <PlayerLink name={item.teammate.name} className="text-parch-300" />
              {item.teammate.heroes.length > 0 ? (
                <span className="text-parch-400">({item.teammate.heroes.join(' + ')})</span>
              ) : null}
            </>
          ) : null}
        </p>

        {/* Line 2 — the opposing side and the battlefield. */}
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-parch-500">
          <span className="text-parch-600">vs</span>
          {item.opponents.length === 0 ? (
            <span>—</span>
          ) : (
            item.opponents.map((opponent, index) => (
              <span key={opponent.name} className="inline-flex items-center gap-1">
                <PlayerLink name={opponent.name} className="text-parch-300" />
                {opponent.heroes.length > 0 ? (
                  <span className="text-parch-500">({opponent.heroes.join(' + ')})</span>
                ) : null}
                {opponent.dual ? (
                  <span
                    className="text-[10px] uppercase tracking-wide text-violet-300"
                    title="Соперник управлял двумя героями"
                  >
                    оба героя
                  </span>
                ) : null}
                {index < item.opponents.length - 1 ? (
                  <span className="text-parch-600">и</span>
                ) : null}
              </span>
            ))
          )}
          {item.match.map ? (
            <>
              <span className="text-parch-600">·</span>
              <span className="text-parch-400">{item.match.map}</span>
            </>
          ) : null}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <span className={`text-xs font-bold uppercase ${tone}`}>
          {item.result === 'win' ? 'победа' : item.result === 'loss' ? 'поражение' : 'ничья'}
        </span>
        <p className="text-[11px] text-parch-500">{formatDate(item.match.timestamp)}</p>
      </div>
    </li>
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
