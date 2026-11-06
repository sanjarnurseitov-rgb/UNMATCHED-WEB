/**
 * Statistics engine.
 *
 * Everything on the dashboard is derived from the normalized match list — no
 * pre-aggregated pivot tables are trusted, because the sheet's own pivot tabs
 * had drifted out of sync with the raw match rows.
 */
import { groupNames, identityKey } from './normalize';
import type {
  AppData,
  DashboardStats,
  DetailedRecord,
  GameMode,
  HeadToHead,
  Match,
  PairSynergy,
  WinRecord,
  ReferenceData,
} from './types';

/** Minimum games before an entity is allowed onto a win-rate leaderboard. */
export const MIN_GAMES_FOR_RATE = 3;
/** Minimum games before a duo is allowed onto the synergy leaderboard. */
export const MIN_GAMES_FOR_SYNERGY = 3;

interface Bucket {
  display: string;
  raw: string[];
  games: number;
  wins: number;
  games1v1: number;
  wins1v1: number;
  games2v2: number;
  wins2v2: number;
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

/** The two opposing seats for a given seat, used for head-to-head counters. */
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

export function computeStats(matches: Match[], reference: ReferenceData): DashboardStats {
  const playerBuckets = new Map<string, Bucket>();
  const heroBuckets = new Map<string, Bucket>();
  const heroPairAgg = new Map<string, { members: [string, string]; games: number; wins: number }>();
  const playerPairAgg = new Map<string, { members: [string, string]; games: number; wins: number }>();
  const comboAgg = new Map<string, { player: string; hero: string; games: number; wins: number }>();
  const h2h = new Map<string, HeadToHead>();
  const timelineAgg = new Map<string, { matches: number; wins: number; losses: number }>();
  const mapAgg = new Map<string, { games: number; wins: number; matches: number }>();
  const modeCounts: Record<GameMode, number> = { '1v1': 0, '2v2': 0 };

  let validMatches = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let degenerateRows = 0;
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

    const seats = winningSeats(match);

    // Historical rows sometimes list the same player in both seats of a team
    // (3 distinct people in a "2 vs 2"). Such a player must be counted once
    // per match, otherwise their game count and win rate are inflated.
    const seenPlayers = new Set<string>();
    const distinctSeats: Array<{ player: string; seat: number }> = [];
    match.players.forEach((player, seat) => {
      if (!player) return;
      const key = identityKey(player);
      if (seenPlayers.has(key)) return;
      seenPlayers.add(key);
      distinctSeats.push({ player, seat });
    });
    if (distinctSeats.length < match.players.filter(Boolean).length) {
      degenerateRows += 1;
    }

    const distinctWins = distinctSeats.filter(({ seat }) => seats.has(seat)).length;
    const distinctPlayers = distinctSeats.length;
    totalWins += distinctWins;
    totalLosses += distinctPlayers - distinctWins;

    if (match.timestamp) timestamps.push(match.timestamp);

    // ---- per-player --------------------------------------------------
    distinctSeats.forEach(({ player, seat }) => {
      const bucket = bump(playerBuckets, player);
      const won = seats.has(seat);
      bucket.games += 1;
      if (won) bucket.wins += 1;
      if (match.mode === '1v1') {
        bucket.games1v1 += 1;
        if (won) bucket.wins1v1 += 1;
      } else {
        bucket.games2v2 += 1;
        if (won) bucket.wins2v2 += 1;
      }

      const hero = match.heroes[seat];
      if (hero) {
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

      if (match.map) {
        bucket.maps.set(match.map, (bucket.maps.get(match.map) ?? 0) + 1);
      }

      // ---- head to head ----------------------------------------------
      for (const oppSeat of opponentsOf(match, seat)) {
        const opp = match.players[oppSeat];
        if (!opp) continue;
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
        const playerWon = seats.has(seat);
        const oppWon = seats.has(oppSeat);
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
      const bucket = bump(heroBuckets, hero);
      const won = seats.has(seat);
      bucket.games += 1;
      if (won) bucket.wins += 1;
      if (match.mode === '1v1') {
        bucket.games1v1 += 1;
        if (won) bucket.wins1v1 += 1;
      } else {
        bucket.games2v2 += 1;
        if (won) bucket.wins2v2 += 1;
      }
      if (match.map) {
        bucket.maps.set(match.map, (bucket.maps.get(match.map) ?? 0) + 1);
      }
    });

    // ---- duos (2v2 synergy) -----------------------------------------
    if (match.mode === '2v2') {
      const teams: Array<{ players: string[]; heroes: string[]; won: boolean }> = [
        {
          players: match.team1Players,
          heroes: match.team1Heroes,
          won: seats.has(0),
        },
        {
          players: match.team2Players,
          heroes: match.team2Heroes,
          won: seats.has(2),
        },
      ];

      for (const team of teams) {
        // A player cannot be their own partner — skip degenerate rows.
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
          identityKey(team.heroes[0]) !== identityKey(team.heroes[1])
        ) {
          const { key, members } = pairKey(team.heroes[0], team.heroes[1]);
          const agg = heroPairAgg.get(key) ?? { members, games: 0, wins: 0 };
          agg.games += 1;
          if (team.won) agg.wins += 1;
          heroPairAgg.set(key, agg);
        }
      }
    }

    // ---- maps ---------------------------------------------------------
    if (match.map) {
      const agg = mapAgg.get(match.map) ?? { games: 0, wins: 0, matches: 0 };
      agg.matches += 1;
      agg.games += distinctPlayers;
      agg.wins += distinctWins;
      mapAgg.set(match.map, agg);
    }

    // ---- timeline ------------------------------------------------------
    if (match.timestamp) {
      const key = monthKey(match.timestamp);
      const agg = timelineAgg.get(key) ?? { matches: 0, wins: 0, losses: 0 };
      agg.matches += 1;
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
        return {
          name: bucket.display,
          image: images.get(identityKey(bucket.display)) ?? null,
          ...base,
          games1v1: bucket.games1v1,
          games2v2: bucket.games2v2,
          wins1v1: bucket.wins1v1,
          wins2v2: bucket.wins2v2,
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

  const rateSorted = (list: DetailedRecord[]) =>
    [...list]
      .filter((r) => r.games >= MIN_GAMES_FOR_RATE)
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

  const mostPopularMapEntry = [...mapAgg.entries()].sort((a, b) => b[1].matches - a[1].matches)[0];
  const mostPopularMap = mostPopularMapEntry
    ? {
        name: mostPopularMapEntry[0],
        games: mostPopularMapEntry[1].matches,
        winRate:
          mostPopularMapEntry[1].games > 0
            ? mostPopularMapEntry[1].wins / mostPopularMapEntry[1].games
            : 0,
      }
    : null;

  const mapStats = [...mapAgg.entries()]
    .sort((a, b) => b[1].matches - a[1].matches)
    .map(([name, agg]) => ({
      name,
      matches: agg.matches,
      games: agg.games,
      wins: agg.wins,
      winRate: agg.games > 0 ? agg.wins / agg.games : 0,
    }));

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
    },
    players,
    heroes,
    playerLeaders: rateSorted(players).slice(0, 10),
    heroLeaders: rateSorted(heroes).slice(0, 10),
    mostPlayedHero,
    mostPopularMap,
    maps: mapStats,
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
    degenerateRows,
    rejectedRows: [],
  };
}

/**
 * Build the dropdown reference lists.
 *
 * IMPORTANT: the sheet's hand-maintained `PlayerList` tab only covers 18 of
 * the 53 players and 78 of the 129 heroes that actually appear in the match
 * history. The union is used, otherwise real players (and every homebrew
 * hero) would be impossible to pick.
 */
export function buildReference(
  listRows: string[][],
  matches: Match[],
  images: { players: Record<string, string>; heroes: Record<string, string> },
): ReferenceData {
  const column = (index: number) =>
    listRows.slice(1).map((r) => (r[index] ?? '').trim()).filter(Boolean);

  const playerNames = [...column(2), ...column(1)];
  const heroNames = [...column(3), ...column(0), ...column(5)];

  const matchPlayers = matches.flatMap((m) => m.players.filter(Boolean));
  const matchHeroes = matches.flatMap((m) => m.heroes.filter(Boolean));

  const playerGroups = groupNames([...playerNames, ...matchPlayers]);
  const heroGroups = groupNames([...heroNames, ...matchHeroes]);

  const players = [...playerGroups.values()]
    .map((g) => ({
      name: g.display,
      image: images.players[identityKey(g.display)] ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const heroes = [...heroGroups.values()]
    .map((g) => ({
      name: g.display,
      homebrew: /\(\s*фан\s*\)/i.test(g.display),
      image: images.heroes[identityKey(g.display)] ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const maps = [
    ...column(8).map((name) => ({ name, mode: '2v2' as GameMode })),
    ...column(9).map((name) => ({ name, mode: '1v1' as GameMode })),
  ];

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
  const stats = computeStats(matches, reference);
  stats.rejectedRows = rejected;
  return { matches, reference, stats, meta };
}
