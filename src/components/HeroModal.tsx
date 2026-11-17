'use client';

import { useMemo } from 'react';
import { identityKey, isPlaceholder, pickDisplayName } from '@/lib/normalize';
import { seatWon, winningSeats } from '@/lib/results';
import type { HeroProfile, HeroTier, Match } from '@/lib/types';
import { Avatar, Chip, MiniStat, WinRateBar, formatPct } from './ui';
import { HeroAvatar } from './hero-context';
import { PlayerAvatar, PlayerLink } from './player-context';

/*
 * The context and the avatar live in ./hero-context so that the player modal
 * can use them without importing this file back.
 */
export { HeroAvatar, useHeroModal } from './hero-context';

/* ---------------------------------------------------------------------------
   Global hero modal.

   Every hero avatar in the app (hero tables, synergy lists, match history,
   tier list) is wrapped in <HeroAvatar>. Clicking it opens this modal with
   the full profile of the hero: tier, nemesis, favourite battlefield and the
   best duo it played in.
--------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   The modal itself
--------------------------------------------------------------------------- */

const TIER_STYLE: Record<HeroTier, { label: string; tone: 'gold' | 'emerald' | 'azure' | 'violet' | 'crimson' }> = {
  S: { label: 'S — легенда', tone: 'gold' },
  A: { label: 'A — сильный', tone: 'emerald' },
  B: { label: 'B — крепкий', tone: 'azure' },
  C: { label: 'C — средний', tone: 'violet' },
  D: { label: 'D — слабый', tone: 'crimson' },
};

export function HeroModal({
  profile,
  matches,
  onClose,
}: {
  profile: HeroProfile;
  matches: Match[];
  onClose: () => void;
}) {
  const tier = TIER_STYLE[profile.tier];

  return (
    <>
      <div className="modal-overlay bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="modal-panel panel modal-animated"
        role="dialog"
        aria-modal="true"
        aria-label={`${profile.name} — профиль героя`}
      >
        <header className="flex items-start gap-3 border-b border-ink-700 p-5">
          <Avatar name={profile.name} image={profile.image} size={56} rounded="rounded-xl" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-[family-name:var(--font-display)] text-lg font-bold text-parch-100">
              {profile.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Chip tone={tier.tone}>{tier.label}</Chip>
              {profile.homebrew ? <Chip tone="violet">фан-персонаж</Chip> : null}
              <Chip tone="neutral">{profile.games} матчей</Chip>
            </div>
          </div>
          <button className="btn btn-ghost px-2.5 py-1.5" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <div className="space-y-4 p-5">
          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Винрейт" value={formatPct(profile.winRate)} tone="text-gold-400" />
            <Stat label="Победы" value={profile.wins} tone="text-emerald-400" />
            <Stat label="Поражения" value={profile.losses} tone="text-crimson-400" />
            <Stat
              label="Пик рейт"
              value={formatPct(profile.pickRate)}
              tone="text-azure-400"
              hint="Доля матчей, в которых герой появлялся"
            />
          </div>

          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="flex items-center gap-2">
              <WinRateBar value={profile.winRate} className="flex-1" />
              <span className="text-sm font-bold tabular-nums text-parch-100">
                {formatPct(profile.winRate)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="stat-label">1 vs 1</p>
                <p className="mt-0.5 text-parch-200">
                  {profile.games1v1} игр · винрейт{' '}
                  <span className="font-semibold text-parch-100">
                    {profile.games1v1 > 0 ? formatPct(profile.winRate1v1) : '—'}
                  </span>
                </p>
              </div>
              <div>
                <p className="stat-label">2 vs 2</p>
                <p className="mt-0.5 text-parch-200">
                  {profile.games2v2} игр · винрейт{' '}
                  <span className="font-semibold text-parch-100">
                    {profile.games2v2 > 0 ? formatPct(profile.winRate2v2) : '—'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/*
            Player breakdown — who actually plays this hero.

            The numbers are computed from the loaded match history right here
            in the browser (the same list the app already ships), so they stay
            in sync with the sheet without any extra server-side field.
          */}
          <HeroPlayerBreakdown profile={profile} matches={matches} />

          {/*
            Nemesis & victim — per mode.

            The duel game and the team game are different matchups, so each
            one gets its own block: the worst opponent and the best victim in
            1 vs 1 and in 2 vs 2. Every pick comes from the opponents the hero
            has met at least twice; when only one opponent qualifies, that
            character is both the worst and the best matchup — instead of
            showing the same name twice, a single card explains it.
          */}
          <div className="grid gap-3 sm:grid-cols-2">
            <OpponentCard
              title="Худший враг · 1 vs 1"
              hint="Кто обыгрывает этого героя чаще всего в дуэли"
              opponent={profile.worstEnemy1v1}
              sibling={profile.bestVictim1v1}
              empty="Нет соперников с двумя матчами"
            />
            <OpponentCard
              title="Худший враг · 2 vs 2"
              hint="Кто обыгрывает этого героя чаще всего в командной игре"
              opponent={profile.worstEnemy2v2}
              sibling={profile.bestVictim2v2}
              empty="Нет соперников с двумя матчами"
            />
            <OpponentCard
              title="Лучшая жертва · 1 vs 1"
              hint="Кого этот герой обыгрывает чаще всего в дуэли"
              opponent={profile.bestVictim1v1}
              sibling={profile.worstEnemy1v1}
              empty="Нет соперников с двумя матчами"
            />
            <OpponentCard
              title="Лучшая жертва · 2 vs 2"
              hint="Кого этот герой обыгрывает чаще всего в командной игре"
              opponent={profile.bestVictim2v2}
              sibling={profile.worstEnemy2v2}
              empty="Нет соперников с двумя матчами"
            />
          </div>

          {/* Favourite map & best synergy */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <p className="stat-label">Любимое поле</p>
              {profile.favoriteMap ? (
                <div className="mt-2 flex items-center gap-3">
                  {profile.favoriteMap.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.favoriteMap.image}
                      alt={profile.favoriteMap.name}
                      loading="lazy"
                      className="h-11 w-11 shrink-0 rounded-lg border border-ink-600 object-cover"
                    />
                  ) : (
                    <span
                      className="h-11 w-11 shrink-0 rounded-lg border border-ink-600 bg-ink-800"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-parch-100">
                      {profile.favoriteMap.name}
                    </p>
                    <p className="text-xs text-parch-500">
                      {profile.favoriteMap.games} матчей на этом поле
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-parch-500">Нет данных</p>
              )}
            </div>

            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <p className="stat-label">Лучший союзник</p>
              {profile.bestSynergy ? (
                <div className="mt-2 flex items-center gap-3">
                  <span className="flex shrink-0 -space-x-2">
                    {profile.bestSynergy.members.map((member) => (
                      <HeroAvatar
                        key={member}
                        name={member}
                        size={32}
                        rounded="rounded-md"
                        className="rounded-md ring-2 ring-ink-900"
                      />
                    ))}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-parch-100">
                      {profile.bestSynergy.members.join(' + ')}
                    </p>
                    <p className="text-xs text-parch-500">
                      {profile.bestSynergy.games} совместных матчей · винрейт{' '}
                      <span className="font-semibold text-emerald-400">
                        {formatPct(profile.bestSynergy.winRate)}
                      </span>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-parch-500">
                  Нет достаточно сыгранных дуо в 2 vs 2
                </p>
              )}
            </div>
          </div>

          {/* Favourite battlefields — the full list, not only the top one. */}
          {profile.topMaps.length > 0 ? (
            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <p className="stat-label">Любимые поля</p>
              <ul className="mt-2 space-y-1.5">
                {profile.topMaps.slice(0, 6).map((map) => (
                  <li key={map.name} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-xs text-parch-200">
                      {map.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-parch-400">
                      {map.games} игр
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Full matchup table, per mode */}
          {profile.nemesis.length > 0 ? (
            <details className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-parch-300">
                Все соперники ({profile.nemesis.length})
              </summary>
              <div className="mt-3 max-h-64 overflow-y-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-ink-700 text-left">
                      <th className="stat-label py-1 pr-2">Соперник</th>
                      <th className="stat-label py-1 pr-2 text-right">Матчей</th>
                      <th className="stat-label py-1 pr-2 text-right">Побед</th>
                      <th className="stat-label py-1 pr-2 text-right">Винрейт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.nemesis.map((opponent) => (
                      <tr key={opponent.name} className="border-b border-ink-800/60">
                        <td className="py-1 pr-2 text-parch-200">{opponent.name}</td>
                        <td className="py-1 pr-2 text-right tabular-nums text-parch-400">
                          {opponent.games}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums text-parch-400">
                          {opponent.wins}
                        </td>
                        <td
                          className={`py-1 pr-2 text-right tabular-nums font-semibold ${
                            opponent.winRate >= 0.5 ? 'text-emerald-400' : 'text-crimson-400'
                          }`}
                        >
                          {formatPct(opponent.winRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Player breakdown — who plays this hero
--------------------------------------------------------------------------- */

/** One player's record with one hero. */
export interface HeroPlayerStat {
  /** Normalized key of the player. */
  key: string;
  /** Display name of the player. */
  name: string;
  /** Matches where this player piloted the hero. */
  games: number;
  wins: number;
  losses: number;
  /** Win rate over those matches. Always 0 when there are no games. */
  winRate: number;
}

/** The player highlighted in the breakdown. */
const HIGHLIGHTED_PLAYER = 'паша';

/**
 * Exact, trimmed, case-insensitive comparison with the highlighted player.
 *
 * The comparison is intentionally exact: "Паша Хунхинов" is a different
 * player and must not be counted as "Паша".
 */
function isHighlightedPlayer(name: string): boolean {
  return name.trim().toLowerCase() === HIGHLIGHTED_PLAYER;
}

/**
 * Per-player record with one hero, computed from the match history.
 *
 * Every match of both modes is counted: a player gets one game for every
 * match they played on that hero. The counting mirrors the statistics engine
 * exactly — seats are grouped by player, so a dual-control player (two seats
 * of the same team) is counted once per match and still owns both of their
 * heroes.
 */
export function heroPlayerStats(matches: Match[], heroName: string): HeroPlayerStat[] {
  const heroKey = identityKey(heroName);
  const buckets = new Map<
    string,
    { raw: string[]; games: number; wins: number; losses: number }
  >();

  for (const match of matches) {
    if (!match.valid) continue;

    const winning = winningSeats(match);

    // Group the seats by player.
    const groups = new Map<string, { seats: number[]; heroes: string[] }>();
    match.players.forEach((player, seat) => {
      if (!player || isPlaceholder(player)) return;
      const key = identityKey(player);
      let group = groups.get(key);
      if (!group) {
        group = { seats: [], heroes: [] };
        groups.set(key, group);
      }
      group.seats.push(seat);
      const hero = match.heroes[seat];
      if (hero) group.heroes.push(hero);
    });

    for (const [key, group] of groups) {
      // The player counts for this hero only when they sat at it.
      if (!group.heroes.some((hero) => identityKey(hero) === heroKey)) continue;

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { raw: [], games: 0, wins: 0, losses: 0 };
        buckets.set(key, bucket);
      }
      bucket.raw.push(match.players[group.seats[0]]);
      bucket.games += 1;
      if (seatWon(match, group.seats[0], winning)) bucket.wins += 1;
      else bucket.losses += 1;
    }
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      name: pickDisplayName(bucket.raw),
      games: bucket.games,
      wins: bucket.wins,
      losses: bucket.losses,
      winRate: bucket.games > 0 ? bucket.wins / bucket.games : 0,
    }))
    .sort(
      (a, b) =>
        b.games - a.games ||
        b.winRate - a.winRate ||
        b.wins - a.wins ||
        a.name.localeCompare(b.name, 'ru'),
    );
}

/**
 * The "who plays this hero" block of the hero modal.
 *
 * Two cards: the record of the highlighted player and the top-5 leaderboard.
 * The leaderboard renders only the players that actually played the hero —
 * there are no empty placeholder rows.
 */
function HeroPlayerBreakdown({
  profile,
  matches,
}: {
  profile: HeroProfile;
  matches: Match[];
}) {
  const stats = useMemo(() => heroPlayerStats(matches, profile.name), [matches, profile.name]);

  const top = stats.slice(0, 5);
  const highlighted = stats.find((stat) => isHighlightedPlayer(stat.name)) ?? null;
  const highlightedGames = highlighted?.games ?? 0;
  const highlightedWinRate = highlighted?.winRate ?? 0;
  const hasHighlightedGames = highlightedGames > 0;

  return (
    <section>
      <p className="stat-label">Игроки на этом герое</p>

      {/* Highlighted player */}
      <div className="mt-2 rounded-lg border border-ink-700 bg-ink-900 p-3">
        <div className="flex items-center gap-3">
          <PlayerAvatar name="Паша" size={36} rounded="rounded-md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-parch-100">Паша</p>
            <p className="text-xs text-parch-500">
              {hasHighlightedGames
                ? `${highlightedGames} игр на этом герое`
                : '0 игр на этом герое'}
            </p>
          </div>
          <span
            className={`shrink-0 text-lg font-bold tabular-nums ${
              !hasHighlightedGames
                ? 'text-parch-400'
                : highlightedWinRate >= 0.5
                  ? 'text-emerald-400'
                  : 'text-crimson-400'
            }`}
          >
            {hasHighlightedGames ? formatPct(highlightedWinRate) : '—'}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat stacked label="Игр" value={highlightedGames} />
          <MiniStat stacked label="Побед" value={highlighted?.wins ?? 0} tone="text-emerald-400" />
          <MiniStat
            stacked
            label="Поражений"
            value={highlighted?.losses ?? 0}
            tone="text-crimson-400"
          />
          <MiniStat
            stacked
            label="Винрейт"
            value={hasHighlightedGames ? formatPct(highlightedWinRate) : '—'}
            tone="text-gold-400"
          />
        </div>
      </div>

      {/* Top-5 leaderboard */}
      <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900 p-3">
        <p className="stat-label">Топ-5 игроков на герое</p>
        {top.length === 0 ? (
          <p className="mt-2 text-xs text-parch-500">Нет данных</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {top.map((stat, index) => (
              <TopPlayerRow key={stat.key} stat={stat} rank={index} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Top players of the hero
--------------------------------------------------------------------------- */

/**
 * Rank badge styling: gold for the leader, silver for the runner-up, bronze
 * for the third place, neutral for the rest.
 */
function rankBadgeClass(rank: number): string {
  if (rank === 0) return 'border-gold-500/40 bg-gold-500/15 text-gold-300';
  if (rank === 1) return 'border-slate-400/30 bg-slate-400/10 text-slate-300';
  if (rank === 2) return 'border-orange-600/40 bg-orange-600/15 text-orange-300';
  return 'border-white/10 bg-white/5 text-parch-500';
}

/**
 * Winrate tone: emerald from 60 %, amber from 45 %, rose below that.
 */
function winRateToneClass(winRate: number): string {
  if (winRate >= 0.6) return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
  if (winRate >= 0.45) return 'border-amber-500/30 bg-amber-500/15 text-amber-300';
  return 'border-rose-500/30 bg-rose-500/15 text-rose-300';
}

/**
 * One row of the "top-5 players" leaderboard.
 *
 * The row is a small elevated surface; the numbers live in separate,
 * fixed-width pills so that the columns line up down the whole list. On
 * narrow screens the pills wrap onto their own line under the name.
 */
function TopPlayerRow({ stat, rank }: { stat: HeroPlayerStat; rank: number }) {
  return (
    <li
      className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5 transition-colors hover:bg-white/[0.06]"
    >
      <span
        className={`flex h-6 w-8 shrink-0 items-center justify-center rounded-lg border text-[0.7rem] font-bold tabular-nums ${rankBadgeClass(rank)}`}
        title={`${rank + 1} место`}
      >
        #{rank + 1}
      </span>

      <PlayerAvatar name={stat.name} size={26} rounded="rounded-lg" />

      <PlayerLink
        name={stat.name}
        className="min-w-0 flex-1 truncate text-sm font-medium text-parch-100"
      />

      {/* The metrics: fixed widths keep the columns aligned down the list. */}
      <div className="flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto">
        <span
          title="Всего игр на этом герое"
          className="w-14 shrink-0 whitespace-nowrap rounded-lg bg-white/5 px-2 py-1 text-center text-xs font-medium tabular-nums text-slate-200 sm:w-16"
        >
          {stat.games} игр
        </span>
        <span
          title="Победы"
          className="w-14 shrink-0 whitespace-nowrap rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-center text-xs font-semibold tabular-nums text-emerald-400 sm:w-16"
        >
          {stat.wins} В
        </span>
        <span
          title="Поражения"
          className="w-14 shrink-0 whitespace-nowrap rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-center text-xs font-semibold tabular-nums text-rose-400 sm:w-16"
        >
          {stat.losses} П
        </span>

        {/* Winrate + the win/loss proportion behind it. */}
        <span className="flex w-14 shrink-0 flex-col items-center gap-1 sm:w-16">
          <span
            title="Винрейт на этом герое"
            className={`w-full whitespace-nowrap rounded-lg border px-1 py-1 text-center text-xs font-bold tabular-nums ${winRateToneClass(stat.winRate)}`}
          >
            {formatPct(stat.winRate)}
          </span>
          <span
            className="h-1.5 w-full overflow-hidden rounded-full bg-rose-500/25"
            title={`${stat.wins} побед из ${stat.games} игр`}
            aria-hidden
          >
            <span
              className="block h-full rounded-full bg-emerald-400"
              style={{ width: `${stat.winRate * 100}%` }}
            />
          </span>
        </span>
      </div>
    </li>
  );
}

/**
 * One nemesis / best-victim block.
 *
 * `sibling` is the opposite slot of the same mode (the best victim for a
 * nemesis card and vice versa). When both resolve to the same character the
 * hero has only one qualified opponent, and the card says so instead of
 * pretending there are two.
 */
function OpponentCard({
  title,
  hint,
  opponent,
  sibling,
  empty,
}: {
  title: string;
  hint: string;
  opponent: { name: string; image?: string | null; games: number; wins: number; winRate: number } | null;
  sibling?: { name: string; image?: string | null; games: number; wins: number; winRate: number } | null;
  empty: string;
}) {
  const isOnlyOpponent = Boolean(opponent && sibling && opponent.name === sibling.name);

  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
      <p className="stat-label" title={hint}>
        {title}
      </p>
      {opponent ? (
        <>
          <div className="mt-2 flex items-center gap-3">
            <HeroAvatar name={opponent.name} image={opponent.image} size={32} rounded="rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-parch-100">{opponent.name}</p>
              <p className="text-xs text-parch-500">
                {opponent.games} матчей · {opponent.wins} побед
              </p>
            </div>
            <span
              className={`text-sm font-bold tabular-nums ${
                opponent.winRate >= 0.5 ? 'text-emerald-400' : 'text-crimson-400'
              }`}
            >
              {formatPct(opponent.winRate)}
            </span>
          </div>
          {isOnlyOpponent ? (
            <p className="mt-2 text-[0.7rem] leading-snug text-parch-500">
              Единственный соперник с достаточной выборкой — отдельного «худшего врага» и
              «лучшей жертвы» в этом режиме нет.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-xs text-parch-500">{empty}</p>
      )}
    </div>
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
