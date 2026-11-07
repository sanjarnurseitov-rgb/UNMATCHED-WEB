/**
 * Statistics engine.
 *
 * Everything on the dashboard is derived from the normalized match list — no
 * pre-aggregated pivot tables are trusted, because the sheet's own pivot tabs
 * had drifted out of sync with the raw match rows.
 */
import {
  groupNames,
  identityKey,
  isExcludedHero,
  isHomebrew,
  isPlaceholder,
  isUnknownMap,
  mapKey,
  pickDisplayName,
} from './normalize';
import type {
  AppData,
  DashboardStats,
  DetailedRecord,
  GameMode,
  HeadToHead,
  HeroBreakdown,
  MapStats,
  Match,
  PairSynergy,
  ReferenceData,
  WinRecord,
} from './types';

/**
 * Minimum games before a player is allowed onto the win-rate leaderboard.
 */
export const MIN_GAMES_FOR_PLAYER_RATE = 20;
/** Minimum games before a hero is allowed onto the win-rate leaderboard. */
export const MIN_GAMES_FOR_HERO_RATE = 10;
/** Minimum games before a duo is allowed onto the synergy leaderboard. */
export const MIN_GAMES_FOR_SYNERGY = 3;

export interface StatsOptions {
  /**
   * Exclude heroes matching this predicate from every hero statistic. Matches
   * are still counted for players, maps and the timeline — only the heroes
   * themselves disappear. Used by the "hide fan characters" switch.
   */
  excludeHeroes?: (heroName: string) => boolean;
  /** Rows that could not be parsed — passed straight through to the result. */
  rejectedRows?: Array<{ rowNumber: number; reason: string }>;
}

interface Bucket {
  display: string;
  raw: string[];
  games: number;
  wins: number;
  games1v1: number;
  wins1v1: number;
  games2v2: number;
  wins2v2: number;
  dualGames: number;
  heroes: Map<string, { display: string; games: number; wins: number }>;
  maps: Map<string, number>;
}

function newBucket(display: string): Bucket {
  return {
    display,
    raw: [],
    games: 0,
    wins: 0,
    games1v1: 0,
    wins1v1: 0,
    games2v2: 0,
    wins2v2: 0,
    dualGames: 0,
    heroes: new Map(),
    maps: new Map(),
  };
}

function toRecord(bucket: Bucket): WinRecord {
  const games = bucket.games;
  const wins = bucket.wins;
  return {
    games,
    wins,
    losses: games - wins,
    winRate: games > 0 ? wins / games : 0,
  };
}

/** Who won, expressed as the set of winning seats (0-based within the match). */
function winningSeats(match: Match): Set<number> {
  const seats = new Set<number>();
  if (match.mode === '1v1') {
    if (match.winner === 'p1') seats.add(0);
    else if (match.winner === 'p2') seats.add(1);
  } else {
    if (match.winner === 't1') {
      seats.add(0);
      seats.add(1);
    } else if (match.winner === 't2') {
      seats.add(2);
      seats.add(3);
    }
  }
  return seats;
}

/**
 * Did the player occupying `seat` win?
 *
 * In 1v1 every seat is its own side. In 2v2 both seats of a team share the
 * team's result, which is what makes a dual-control player (one player on
 * both seats of a team) resolve correctly.
 */
function seatWon(match: Match, seat: number, winning: Set<number>): boolean {
  if (match.mode === '1v1') return winning.has(seat);
  const team = seat < 2 ? 1 : 2;
  return team === 1 ? winning.has(0) : winning.has(2);
}

/** The opposing seats for a given seat, used for head-to-head counters. */
function opponentsOf(match: Match, seat: number): number[] {
  if (match.mode === '1v1') return [seat === 0 ? 1 : 0];
  if (seat < 2) return [2, 3];
  return [0, 1];
}

function pairKey(a: string, b: string): { key: string; members: [string, string] } {
  const sorted = [a, b].sort((x, y) => x.localeCompare(y, 'ru'));
  return { key: sorted.join(' + '), members: [sorted[0], sorted[1]] };
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  const names = [
    'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
  ];
  return `${names[Number(month) - 1]} ${year}`;
}

/**
 * Battlefield bucket for a match.
 *
 * Returns `null` when the match has no usable battlefield: an empty cell, or
 * a placeholder such as "Неизвестно". Unknown battlefields are counted
 * separately and never enter the map ratings or charts — otherwise they
 * would outrank every real battlefield.
 */
export function mapBucket(match: Match): string | null {
  const map = match.map?.trim();
  if (!map) return null;
  if (isUnknownMap(map)) return null;
  return map;
}

interface MapAggregate {
  games: number;
  wins: number;
  matches: number;
  heroes: Map<string, { display: string; games: number }>;
  players: Map<string, { display: string; wins: number; games: number }>;
}

export function computeStats(
  matches: Match[],
  reference: ReferenceData,
  options: StatsOptions = {},
): DashboardStats {
  const excludeHeroes = options.excludeHeroes ?? (() => false);
  const isHeroHidden = (hero: string) =>
    excludeHeroes(hero) || isExcludedHero(hero) || isPlaceholder(hero);

  const playerBuckets = new Map<string, Bucket>();
  const heroBuckets = new Map<string, Bucket>();
  const heroPairAgg = new Map<string, { members: [string, string]; games: number; wins: number }>();
  const playerPairAgg = new Map<string, { members: [string, string]; games: number; wins: number }>();
  const comboAgg = new Map<string, { player: string; hero: string; games: number; wins: number }>();
  const h2h = new Map<string, HeadToHead>();
  const timelineAgg = new Map<
    string,
    { matches: number; matches1v1: number; matches2v2: number; wins: number; losses: number }
  >();
  const mapAgg = new Map<string, MapAggregate>();
  const modeCounts: Record<GameMode, number> = { '1v1': 0, '2v2': 0 };

  let validMatches = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let dualControlMatches = 0;
  let unmappedMatches = 0;
  const timestamps: string[] = [];

  const bump = (buckets: Map<string, Bucket>, name: string) => {
    const key = identityKey(name);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = newBucket(name);
      buckets.set(key, bucket);
    }
    bucket.raw.push(name);
    return bucket;
  };

  for (const match of matches) {
    if (!match.valid) continue;
    validMatches += 1;
    modeCounts[match.mode] += 1;
    if (match.dualControl.length > 0) dualControlMatches += 1;

    const winning = winningSeats(match);

    // Group seats by player. A dual-control player occupies two seats of the
    // same team and must be counted exactly once per match, while still
    // owning both of their heroes.
    const seatGroups = new Map<string, { player: string; seats: number[]; heroes: string[] }>();
    match.players.forEach((player, seat) => {
      if (!player) return;
      // Placeholders such as "Неизвестно" are not players.
      if (isPlaceholder(player)) return;
      const key = identityKey(player);
      let group = seatGroups.get(key);
      if (!group) {
        group = { player, seats: [], heroes: [] };
        seatGroups.set(key, group);
      }
      group.seats.push(seat);
      const hero = match.heroes[seat];
      if (hero) group.heroes.push(hero);
    });
    const distinctSeats = [...seatGroups.values()];

    const distinctWins = distinctSeats.filter((g) => seatWon(match, g.seats[0], winning)).length;
    const distinctPlayers = distinctSeats.length;
    totalWins += distinctWins;
    totalLosses += distinctPlayers - distinctWins;

    if (match.timestamp) timestamps.push(match.timestamp);

    // Battlefield. Unknown / unnamed maps are counted but never rated.
    const mapName = mapBucket(match);
    if (!mapName) unmappedMatches += 1;

    // ---- per-player --------------------------------------------------
    distinctSeats.forEach((group) => {
      const { player, seats, heroes } = group;
      const seat = seats[0];
      const bucket = bump(playerBuckets, player);
      const won = seatWon(match, seat, winning);
      bucket.games += 1;
      if (won) bucket.wins += 1;
      if (seats.length > 1) bucket.dualGames += 1;
      if (match.mode === '1v1') {
        bucket.games1v1 += 1;
        if (won) bucket.wins1v1 += 1;
      } else {
        bucket.games2v2 += 1;
        if (won) bucket.wins2v2 += 1;
      }

      // A dual-control player owns every hero they sat at.
      for (const hero of heroes) {
        if (isHeroHidden(hero)) continue;
        const heroKey = identityKey(hero);
        let heroStat = bucket.heroes.get(heroKey);
        if (!heroStat) {
          heroStat = { display: hero, games: 0, wins: 0 };
          bucket.heroes.set(heroKey, heroStat);
        }
        heroStat.games += 1;
        if (won) heroStat.wins += 1;

        const comboKey = `${identityKey(player)}|${heroKey}`;
        let combo = comboAgg.get(comboKey);
        if (!combo) {
          combo = { player, hero, games: 0, wins: 0 };
          comboAgg.set(comboKey, combo);
        }
        combo.games += 1;
        if (won) combo.wins += 1;
      }

      if (mapName) {
        bucket.maps.set(mapName, (bucket.maps.get(mapName) ?? 0) + 1);
      }

      // ---- head to head ----------------------------------------------
      for (const oppSeat of opponentsOf(match, seat)) {
        const opp = match.players[oppSeat];
        if (!opp) continue;
        if (isPlaceholder(opp)) continue;
        // A player cannot play against themselves.
        if (identityKey(opp) === identityKey(player)) continue;
        const { key, members } = pairKey(player, opp);
        const existing = h2h.get(key) ?? {
          a: members[0],
          b: members[1],
          games: 0,
          winsA: 0,
          winsB: 0,
        };
        existing.games += 1;
        const playerWon = seatWon(match, seat, winning);
        const oppWon = seatWon(match, oppSeat, winning);
        if (playerWon && !oppWon) {
          if (existing.a === player) existing.winsA += 1;
          else existing.winsB += 1;
        } else if (oppWon && !playerWon) {
          if (existing.a === opp) existing.winsA += 1;
          else existing.winsB += 1;
        }
        h2h.set(key, existing);
      }
    });

    // ---- per-hero ----------------------------------------------------
    match.heroes.forEach((hero, seat) => {
      if (!hero) return;
      if (isHeroHidden(hero)) return;
      const bucket = bump(heroBuckets, hero);
      const won = seatWon(match, seat, winning);
      bucket.games += 1;
      if (won) bucket.wins += 1;
      if (match.mode === '1v1') {
        bucket.games1v1 += 1;
        if (won) bucket.wins1v1 += 1;
      } else {
        bucket.games2v2 += 1;
        if (won) bucket.wins2v2 += 1;
      }
    });

    // ---- duos (2v2 synergy) -----------------------------------------
    if (match.mode === '2v2') {
      const teams: Array<{ players: string[]; heroes: string[]; won: boolean }> = [
        {
          players: match.team1Players,
          heroes: match.team1Heroes,
          won: winning.has(0),
        },
        {
          players: match.team2Players,
          heroes: match.team2Heroes,
          won: winning.has(2),
        },
      ];

      for (const team of teams) {
        // Two seats held by the same player are not a partnership — but the
        // two heroes they controlled DO form a valid hero duo.
        if (
          team.players.length === 2 &&
          team.players.every(Boolean) &&
          identityKey(team.players[0]) !== identityKey(team.players[1])
        ) {
          const { key, members } = pairKey(team.players[0], team.players[1]);
          const agg = playerPairAgg.get(key) ?? { members, games: 0, wins: 0 };
          agg.games += 1;
          if (team.won) agg.wins += 1;
          playerPairAgg.set(key, agg);
        }
        if (
          team.heroes.length === 2 &&
          team.heroes.every(Boolean) &&
          identityKey(team.heroes[0]) !== identityKey(team.heroes[1]) &&
          !isHeroHidden(team.heroes[0]) &&
          !isHeroHidden(team.heroes[1])
        ) {
          const { key, members } = pairKey(team.heroes[0], team.heroes[1]);
          const agg = heroPairAgg.get(key) ?? { members, games: 0, wins: 0 };
          agg.games += 1;
          if (team.won) agg.wins += 1;
          heroPairAgg.set(key, agg);
        }
      }
    }

    // ---- battlefields -------------------------------------------------
    if (mapName) {
      const key = mapKey(mapName);
      let agg = mapAgg.get(key);
      if (!agg) {
        agg = {
          games: 0,
          wins: 0,
          matches: 0,
          heroes: new Map(),
          players: new Map(),
        };
        mapAgg.set(key, agg);
      }
      agg.matches += 1;
      agg.games += distinctPlayers;
      agg.wins += distinctWins;

      // Hero played most often on this battlefield.
      match.heroes.forEach((hero) => {
        if (!hero || isHeroHidden(hero)) return;
        const heroKey = identityKey(hero);
        const entry = agg.heroes.get(heroKey) ?? { display: hero, games: 0 };
        entry.games += 1;
        agg.heroes.set(heroKey, entry);
      });

      // Player who won most often on this battlefield.
      distinctSeats.forEach((group) => {
        const playerKey = identityKey(group.player);
        const entry = agg.players.get(playerKey) ?? {
          display: group.player,
          wins: 0,
          games: 0,
        };
        entry.games += 1;
        if (seatWon(match, group.seats[0], winning)) entry.wins += 1;
        agg.players.set(playerKey, entry);
      });
    }

    // ---- timeline ------------------------------------------------------
    if (match.timestamp) {
      const key = monthKey(match.timestamp);
      const agg = timelineAgg.get(key) ?? {
        matches: 0,
        matches1v1: 0,
        matches2v2: 0,
        wins: 0,
        losses: 0,
      };
      agg.matches += 1;
      if (match.mode === '1v1') agg.matches1v1 += 1;
      else agg.matches2v2 += 1;
      agg.wins += distinctWins;
      agg.losses += distinctPlayers - distinctWins;
      timelineAgg.set(key, agg);
    }
  }

  // ------------------------------------------------------------------
  // Materialise buckets into sorted leaderboards.
  // ------------------------------------------------------------------
  const playerImages = new Map(reference.players.map((p) => [identityKey(p.name), p.image ?? null]));
  const heroImages = new Map(reference.heroes.map((h) => [identityKey(h.name), h.image ?? null]));

  const buildRecords = (
    buckets: Map<string, Bucket>,
    images: Map<string, string | null>,
  ): DetailedRecord[] =>
    [...buckets.values()]
      .map((bucket) => {
        const base = toRecord(bucket);
        const losses1v1 = bucket.games1v1 - bucket.wins1v1;
        const losses2v2 = bucket.games2v2 - bucket.wins2v2;
        return {
          name: bucket.display,
          image: images.get(identityKey(bucket.display)) ?? null,
          ...base,
          games1v1: bucket.games1v1,
          games2v2: bucket.games2v2,
          wins1v1: bucket.wins1v1,
          wins2v2: bucket.wins2v2,
          losses1v1,
          losses2v2,
          winRate1v1: bucket.games1v1 > 0 ? bucket.wins1v1 / bucket.games1v1 : 0,
          winRate2v2: bucket.games2v2 > 0 ? bucket.wins2v2 / bucket.games2v2 : 0,
          dualGames: bucket.dualGames,
          topHeroes: [...bucket.heroes.values()]
            .map((h) => ({
              name: h.display,
              games: h.games,
              wins: h.wins,
              winRate: h.games > 0 ? h.wins / h.games : 0,
            }))
            .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
            .slice(0, 5),
          topMaps: [...bucket.maps.entries()]
            .map(([name, games]) => ({ name, games }))
            .sort((a, b) => b.games - a.games)
            .slice(0, 5),
        } satisfies DetailedRecord;
      })
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, 'ru'));

  const players = buildRecords(playerBuckets, playerImages);
  const heroes = buildRecords(heroBuckets, heroImages);

  const rateSorted = (list: DetailedRecord[], minGames: number) =>
    [...list]
      .filter((r) => r.games >= minGames)
      .sort((a, b) => b.winRate - a.winRate || b.games - a.games);

  const buildPairs = (
    agg: Map<string, { members: [string, string]; games: number; wins: number }>,
  ): PairSynergy[] =>
    [...agg.values()]
      .filter((p) => p.games >= MIN_GAMES_FOR_SYNERGY)
      .map((p) => ({
        key: p.members.join(' + '),
        members: p.members,
        games: p.games,
        wins: p.wins,
        losses: p.games - p.wins,
        winRate: p.wins / p.games,
      }))
      .sort((a, b) => b.winRate - a.winRate || b.games - a.games);

  const bestHeroSynergy = buildPairs(heroPairAgg);
  const bestPlayerSynergy = buildPairs(playerPairAgg);

  const mostPlayedHero = [...heroes].sort(
    (a, b) => b.games - a.games || b.winRate - a.winRate,
  )[0] ?? null;

  // Battlefield statistics — unknown / unnamed maps never enter the ratings.
  const mapStats: Array<MapStats & { key: string }> = [...mapAgg.entries()].map(([key, agg]) => {
    const topHeroEntry = [...agg.heroes.values()].sort((a, b) => b.games - a.games)[0] ?? null;
    const topHero = topHeroEntry
      ? { name: topHeroEntry.display, games: topHeroEntry.games }
      : null;
    const topPlayerEntry =
      [...agg.players.values()].sort((a, b) => b.wins - a.wins || b.games - a.games)[0] ?? null;
    const topPlayer = topPlayerEntry
      ? {
          name: topPlayerEntry.display,
          wins: topPlayerEntry.wins,
          games: topPlayerEntry.games,
        }
      : null;
    return {
      key,
      name: '',
      matches: agg.matches,
      games: agg.games,
      wins: agg.wins,
      winRate: agg.games > 0 ? agg.wins / agg.games : 0,
      topHero,
      topPlayer,
    };
  });

  // The display name of a battlefield is the curated `PlayerList` spelling
  // when the battlefield also exists there, otherwise the most frequent
  // spelling seen in the match history.
  const historySpellings = new Map<string, string[]>();
  for (const match of matches) {
    const name = mapBucket(match);
    if (!name) continue;
    const key = mapKey(name);
    const list = historySpellings.get(key) ?? [];
    list.push(name);
    historySpellings.set(key, list);
  }
  const referenceSpellings = new Map<string, string[]>();
  for (const entry of reference.maps) {
    const key = mapKey(entry.name);
    const list = referenceSpellings.get(key) ?? [];
    list.push(entry.name);
    referenceSpellings.set(key, list);
  }
  for (const entry of mapStats) {
    const curated = referenceSpellings.get(entry.key) ?? [];
    entry.name =
      curated.length > 0
        ? pickDisplayName(curated)
        : pickDisplayName(historySpellings.get(entry.key) ?? []);
  }
  mapStats.sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name, 'ru'));

  const mostPopularMapEntry = mapStats[0];
  const mostPopularMap = mostPopularMapEntry
    ? {
        name: mostPopularMapEntry.name,
        games: mostPopularMapEntry.matches,
        winRate: mostPopularMapEntry.winRate,
      }
    : null;

  const heroBreakdown: HeroBreakdown = reference.heroes.reduce<HeroBreakdown>(
    (acc, hero) => {
      acc.total += 1;
      if (hero.homebrew || isHomebrew(hero.name)) acc.homebrew += 1;
      else acc.official += 1;
      return acc;
    },
    { total: 0, official: 0, homebrew: 0 },
  );

  const sortedTimestamps = timestamps.sort();

  return {
    totals: {
      matches: matches.length,
      validMatches,
      wins: totalWins,
      losses: totalLosses,
      winRate: totalWins + totalLosses > 0 ? totalWins / (totalWins + totalLosses) : 0,
      modes: modeCounts,
      firstMatch: sortedTimestamps[0] ?? null,
      lastMatch: sortedTimestamps[sortedTimestamps.length - 1] ?? null,
      dualControlMatches,
      unmappedMatches,
    },
    players,
    heroes,
    playerLeaders: rateSorted(players, MIN_GAMES_FOR_PLAYER_RATE).slice(0, 10),
    heroLeaders: rateSorted(heroes, MIN_GAMES_FOR_HERO_RATE).slice(0, 10),
    mostPlayedHero,
    mostPopularMap,
    maps: mapStats.map(({ key: _key, ...rest }) => rest),
    bestHeroSynergy: bestHeroSynergy.slice(0, 10),
    bestPlayerSynergy: bestPlayerSynergy.slice(0, 10),
    favouriteCombos: [...comboAgg.values()]
      .map((combo) => ({
        ...combo,
        winRate: combo.games > 0 ? combo.wins / combo.games : 0,
      }))
      .sort((a, b) => b.games - a.games || b.wins - a.wins)
      .slice(0, 12),
    timeline: [...timelineAgg.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, agg]) => ({ ...agg, month: monthLabel(key) })),
    modeSplit: [
      { mode: '1v1' as GameMode, matches: modeCounts['1v1'] },
      { mode: '2v2' as GameMode, matches: modeCounts['2v2'] },
    ],
    headToHead: [...h2h.values()]
      .filter((h) => h.games >= 2)
      .sort((a, b) => b.games - a.games)
      .slice(0, 12),
    heroBreakdown,
    rejectedRows: options.rejectedRows ?? [],
  };
}

/**
 * Prefer the curated spelling from the `PlayerList` sheet over the spelling
 * that happens to be most frequent in the match history.
 *
 * The sheet's own list is the one people recognise — "Миша Бонс" from column
 * C rather than the all-caps "Миша БОНС" that a few form responses produced.
 * Sources are tried in priority order; the first one that knows a name wins.
 */
function applyPreferredSpellings(
  groups: Map<string, { display: string; raw: string[] }>,
  sources: string[][],
): void {
  const resolved = new Set<string>();
  for (const source of sources) {
    const byKey = new Map<string, string[]>();
    for (const name of source) {
      const key = identityKey(name);
      if (resolved.has(key)) continue;
      const list = byKey.get(key) ?? [];
      list.push(name);
      byKey.set(key, list);
    }
    for (const [key, list] of byKey) {
      const bucket = groups.get(key);
      if (!bucket) continue;
      bucket.display = pickDisplayName(list);
      resolved.add(key);
    }
  }
}

/**
 * Build the dropdown reference lists.
 *
 * IMPORTANT: the sheet's hand-maintained `PlayerList` tab only covers 18 of
 * the players and 78 of the heroes that actually appear in the match
 * history. The union is used, otherwise real players (and every homebrew
 * hero) would be impossible to pick. The same applies to battlefields: the
 * reference columns are stale, so every battlefield seen in a match is added
 * as well — including the ones only ever played in 1 vs 1.
 *
 * Players come strictly from column C of `PlayerList` plus the players found
 * in the match history; placeholders such as "Неизвестно" are dropped.
 */
export function buildReference(
  listRows: string[][],
  matches: Match[],
  images: { players: Record<string, string>; heroes: Record<string, string> },
): ReferenceData {
  const column = (index: number) =>
    listRows.slice(1).map((r) => (r[index] ?? '').trim()).filter(Boolean);

  const playerColumn = column(2); // C — СПИСОК ИГРОКОВ
  const heroColumns = [
    column(0), // A — полный список героев
    column(3), // D — герои для анкеты
    column(5), // F — фан персы игранные
  ];

  // --- players: column C + players seen in the match history --------------
  const playerNames = [
    ...playerColumn,
    ...matches.flatMap((m) => m.players.filter(Boolean)),
  ].filter((name) => !isPlaceholder(name));

  // --- heroes: hero columns + heroes seen in the match history -------------
  const heroNames = [
    ...heroColumns.flat(),
    ...matches.flatMap((m) => m.heroes.filter(Boolean)),
  ].filter((name) => !isExcludedHero(name) && !isPlaceholder(name));

  const playerGroups = groupNames(playerNames);
  applyPreferredSpellings(playerGroups, [playerColumn]);

  const heroGroups = groupNames(heroNames);
  applyPreferredSpellings(heroGroups, heroColumns);

  const players = [...playerGroups.values()]
    .map((g) => ({
      name: g.display,
      image: images.players[identityKey(g.display)] ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const heroes = [...heroGroups.values()]
    .map((g) => ({
      name: g.display,
      homebrew: isHomebrew(g.display),
      image: images.heroes[identityKey(g.display)] ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  // --- battlefields: reference columns + every battlefield seen in a match --
  const mapModes = new Map<
    string,
    { spellings: string[]; curated: string[]; modes: Set<GameMode> }
  >();
  const addMap = (name: string, mode: GameMode, curated: boolean) => {
    if (!name) return;
    const key = mapKey(name);
    if (!key) return;
    const entry = mapModes.get(key) ?? {
      spellings: [],
      curated: [],
      modes: new Set<GameMode>(),
    };
    if (curated) entry.curated.push(name);
    else entry.spellings.push(name);
    entry.modes.add(mode);
    mapModes.set(key, entry);
  };

  column(8).forEach((name) => addMap(name, '2v2', true)); // I — Поля 2 на 2
  column(9).forEach((name) => addMap(name, '1v1', true)); // J — Поля 1 vs 1
  for (const match of matches) {
    const name = mapBucket(match);
    if (name) addMap(name, match.mode, false);
  }

  const maps: Array<{ name: string; mode: GameMode }> = [];
  for (const entry of mapModes.values()) {
    const display =
      entry.curated.length > 0
        ? pickDisplayName(entry.curated)
        : pickDisplayName(entry.spellings);
    for (const mode of entry.modes) maps.push({ name: display, mode });
  }
  maps.sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.mode.localeCompare(b.mode));

  return { players, heroes, maps };
}

/** Assemble the full payload sent to the client. */
export function buildAppData(
  matches: Match[],
  listRows: string[][],
  images: { players: Record<string, string>; heroes: Record<string, string> },
  meta: AppData['meta'],
  rejected: Array<{ rowNumber: number; reason: string }>,
): AppData {
  const reference = buildReference(listRows, matches, images);
  const stats = computeStats(matches, reference, { rejectedRows: rejected });
  return { matches, reference, stats, meta };
}
