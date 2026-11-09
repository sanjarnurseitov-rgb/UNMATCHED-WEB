/**
 * Statistics engine.
 *
 * Everything on the dashboard is derived from the normalized match list — no
 * pre-aggregated pivot tables are trusted, because the sheet's own pivot tabs
 * had drifted out of sync with the raw match rows.
 *
 * The engine is a pure function of (matches, reference), which lets the UI
 * recompute everything in the browser when a filter (e.g. "hide fan heroes")
 * changes.
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
import type { CuratedAppearance } from './parse';
import type {
  AppData,
  DashboardStats,
  DetailedRecord,
  FirstTurnBalance,
  GameMode,
  HeadToHead,
  HeroBreakdown,
  HeroProfile,
  HeroTier,
  MapStats,
  Match,
  Matchup,
  OpponentStat,
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
/** Minimum games before a hero gets a tier and enters the tier list. */
export const MIN_GAMES_FOR_TIER = 5;
/** Minimum games before a matchup counts towards the nemesis statistics. */
export const MIN_GAMES_FOR_NEMESIS = 2;

export interface StatsOptions {
  /**
   * Exclude heroes matching this predicate from every hero statistic. Matches
   * are still counted for players, maps and the timeline — only the heroes
   * themselves disappear. Used by the "hide fan characters" switch.
   */
  excludeHeroes?: (heroName: string) => boolean;
  /** Rows that could not be parsed — passed straight through to the result. */
  rejectedRows?: Array<{ rowNumber: number; reason: string }>;
  /**
   * The sheet's curated per-mode match sheets. Used only to cross-check the
   * aggregation against an independent copy of the history — never as a data
   * source.
   */
  curated?: { oneVsOne: CuratedAppearance[]; twoVsTwo: CuratedAppearance[] };
}

/** Lookup maps for the artwork stored in the IMAGES tab. */
export interface ImageIndex {
  players: Record<string, string>;
  heroes: Record<string, string>;
  maps: Record<string, string>;
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

/**
 * The side that moved first.
 *
 * The sheet has no explicit "first turn" column, so — as documented — Player 1
 * (1 vs 1) and Team 1 (2 vs 2) are assumed to have the first turn.
 */
function firstTurnWon(match: Match, winning: Set<number>): boolean {
  return match.mode === '1v1' ? winning.has(0) : winning.has(0);
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

/**
 * Assign a performance tier from the win rate.
 *
 * The cut points are absolute so the tier list stays comparable over time
 * instead of being re-normalised whenever a new hero is added.
 */
export function tierFor(winRate: number, games: number): HeroTier {
  if (games < MIN_GAMES_FOR_TIER) return 'C';
  if (winRate >= 0.6) return 'S';
  if (winRate >= 0.55) return 'A';
  if (winRate >= 0.5) return 'B';
  if (winRate >= 0.45) return 'C';
  return 'D';
}

interface MapAggregate {
  games: number;
  wins: number;
  matches: number;
  firstTurnWins: number;
  /** Heroes on this battlefield with their games and wins here. */
  heroes: Map<string, { display: string; games: number; wins: number }>;
  players: Map<string, { display: string; wins: number; games: number }>;
}

interface MatchupAggregate {
  members: [string, string];
  games: number;
  winsByHero: Map<string, number>;
}

/**
 * Accumulate "how does this hero fare against that opponent" records.
 *
 * One entry per (hero, opponent) pair; the opponent is counted once per
 * match the two met, no matter how many seats they occupied.
 */
function recordOpponent(
  target: Map<string, OpponentStat[]>,
  hero: string,
  opponent: string,
  won: boolean,
): void {
  const heroKey = identityKey(hero);
  let list = target.get(heroKey);
  if (!list) {
    list = [];
    target.set(heroKey, list);
  }
  const opponentKey = identityKey(opponent);
  let entry = list.find((item) => identityKey(item.name) === opponentKey);
  if (!entry) {
    entry = {
      name: opponent,
      image: null,
      games: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
    };
    list.push(entry);
  }
  entry.games += 1;
  if (won) entry.wins += 1;
  else entry.losses += 1;
  entry.winRate = entry.games > 0 ? entry.wins / entry.games : 0;
}

/** Merge two opponent lists for the same hero into one. */
function mergeOpponents(base: OpponentStat[], extra: OpponentStat[]): OpponentStat[] {
  const out = base.map((entry) => ({ ...entry }));
  for (const entry of extra) {
    const existing = out.find((item) => identityKey(item.name) === identityKey(entry.name));
    if (!existing) {
      out.push({ ...entry });
      continue;
    }
    existing.games += entry.games;
    existing.wins += entry.wins;
    existing.losses += entry.losses;
    existing.winRate = existing.games > 0 ? existing.wins / existing.games : 0;
  }
  return out;
}

/**
 * Pick the nemesis and the best victim of a hero from a list of opponents.
 *
 * Only opponents with at least MIN_GAMES_FOR_NEMESIS meetings qualify — a
 * single game would otherwise produce a meaningless 100 % / 0 % pair.
 *
 *   nemesis      — the opponent this hero loses to most often
 *                  (the LOWEST win rate for this hero)
 *   best victim  — the opponent this hero beats most often
 *                  (the HIGHEST win rate for this hero)
 *
 * Both are picked from the same qualified pool, and they are always
 * *different* opponents whenever the pool holds more than one entry.
 */
function pickNemesis(opponents: OpponentStat[]): {
  worst: OpponentStat | null;
  best: OpponentStat | null;
} {
  const qualified = opponents.filter((o) => o.games >= MIN_GAMES_FOR_NEMESIS);
  const byLowest = [...qualified].sort(
    (a, b) => a.winRate - b.winRate || b.games - a.games || a.name.localeCompare(b.name, 'ru'),
  );
  const byHighest = [...qualified].sort(
    (a, b) => b.winRate - a.winRate || b.games - a.games || a.name.localeCompare(b.name, 'ru'),
  );
  const worst = byLowest[0] ?? null;
  let best = byHighest[0] ?? null;
  if (worst && best && worst.name === best.name && byHighest.length > 1) {
    best = byHighest[1];
  }
  return { worst, best };
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
  const matchupAgg = new Map<string, MatchupAggregate>();
  /** Hero-vs-hero records, split by mode: 1 vs 1 and 2 vs 2. */
  const opponentStats1v1 = new Map<string, OpponentStat[]>();
  const opponentStats2v2 = new Map<string, OpponentStat[]>();
  const firstTurnAgg: Record<GameMode, { matches: number; first: number; second: number }> = {
    '1v1': { matches: 0, first: 0, second: 0 },
    '2v2': { matches: 0, first: 0, second: 0 },
  };
  const modeCounts: Record<GameMode, number> = { '1v1': 0, '2v2': 0 };

  let validMatches = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let dualControlMatches = 0;
  let unmappedMatches = 0;
  let officialMatches = 0;
  let homebrewMatches = 0;
  let officialSlots = 0;
  let homebrewSlots = 0;
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

    // First turn (Player 1 / Team 1 is assumed to move first).
    if (match.winner) {
      const turn = firstTurnAgg[match.mode];
      turn.matches += 1;
      if (firstTurnWon(match, winning)) turn.first += 1;
      else turn.second += 1;
    }

    // Official vs homebrew heroes — independent of the "hide fan heroes"
    // switch, so the catalogue breakdown stays stable.
    let hasOfficial = false;
    let hasHomebrew = false;
    for (const hero of match.heroes) {
      if (!hero) continue;
      if (isExcludedHero(hero) || isPlaceholder(hero)) continue;
      if (isHomebrew(hero)) {
        hasHomebrew = true;
        homebrewSlots += 1;
      } else {
        hasOfficial = true;
        officialSlots += 1;
      }
    }
    if (hasOfficial) officialMatches += 1;
    if (hasHomebrew) homebrewMatches += 1;

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
      // Battlefields the hero played on — used for "favourite map".
      if (mapName) {
        bucket.maps.set(mapName, (bucket.maps.get(mapName) ?? 0) + 1);
      }
      if (match.mode === '1v1') {
        bucket.games1v1 += 1;
        if (won) bucket.wins1v1 += 1;
      } else {
        bucket.games2v2 += 1;
        if (won) bucket.wins2v2 += 1;
      }
    });

    // ---- 1 vs 1 hero matchups ----------------------------------------
    if (match.mode === '1v1') {
      const heroA = match.heroes[0];
      const heroB = match.heroes[1];
      if (heroA && heroB && !isHeroHidden(heroA) && !isHeroHidden(heroB)) {
        const { key, members } = pairKey(heroA, heroB);
        const agg = matchupAgg.get(key) ?? {
          members,
          games: 0,
          winsByHero: new Map<string, number>(),
        };
        agg.games += 1;
        const winnerHero = match.winner === 'p1' ? heroA : match.winner === 'p2' ? heroB : null;
        if (winnerHero) {
          const winnerKey = identityKey(winnerHero);
          agg.winsByHero.set(winnerKey, (agg.winsByHero.get(winnerKey) ?? 0) + 1);
        }
        matchupAgg.set(key, agg);
      }
    }

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

      /*
       * Hero vs hero records in 2 vs 2: every hero on one team is an
       * opponent for every hero on the other team. This is what makes the
       * nemesis / victim statistics meaningful for the team game as well.
       */
      const visible = teams.map((team) => ({
        won: team.won,
        heroes: team.heroes.filter((hero) => hero && !isHeroHidden(hero)),
      }));
      for (const side of visible) {
        for (const opponentSide of visible) {
          if (side === opponentSide) continue;
          for (const hero of side.heroes) {
            for (const opponent of opponentSide.heroes) {
              recordOpponent(opponentStats2v2, hero, opponent, side.won);
            }
          }
        }
      }

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
          firstTurnWins: 0,
          heroes: new Map(),
          players: new Map(),
        };
        mapAgg.set(key, agg);
      }
      agg.matches += 1;
      agg.games += distinctPlayers;
      agg.wins += distinctWins;
      if (match.winner && firstTurnWon(match, winning)) agg.firstTurnWins += 1;

      // Heroes on this battlefield: how often they played and how often they won.
      match.heroes.forEach((hero, seat) => {
        if (!hero || isHeroHidden(hero)) return;
        const heroKey = identityKey(hero);
        const entry = agg.heroes.get(heroKey) ?? { display: hero, games: 0, wins: 0 };
        entry.games += 1;
        if (seatWon(match, seat, winning)) entry.wins += 1;
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
  const mapImages = new Map(reference.maps.map((m) => [mapKey(m.name), m.image ?? null]));

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

  const heroSynergies = buildPairs(heroPairAgg);
  const playerSynergies = buildPairs(playerPairAgg);
  const bestHeroSynergy = heroSynergies.slice(0, 10);
  const bestPlayerSynergy = playerSynergies.slice(0, 10);
  const antiSynergies = [...heroSynergies].reverse().slice(0, 12);

  const mostPlayedHero = [...heroes].sort(
    (a, b) => b.games - a.games || b.winRate - a.winRate,
  )[0] ?? null;

  // ------------------------------------------------------------------
  // 1 vs 1 matchups and the nemesis / victim statistics.
  // ------------------------------------------------------------------
  const matchups: Matchup[] = [...matchupAgg.values()]
    .map((agg) => {
      const winsA = agg.winsByHero.get(identityKey(agg.members[0])) ?? 0;
      const winsB = agg.winsByHero.get(identityKey(agg.members[1])) ?? 0;
      return {
        heroA: agg.members[0],
        heroB: agg.members[1],
        games: agg.games,
        winsA,
        winsB,
        winRateA: agg.games > 0 ? winsA / agg.games : 0,
      };
    })
    .sort((a, b) => b.games - a.games);

  /** For every hero: how it fares against each opponent it has met. */
  const opponentStats = new Map<string, OpponentStat[]>();
  for (const matchup of matchups) {
    const record = (hero: string, opponent: string, wins: number, games: number) => {
      const list = opponentStats.get(identityKey(hero)) ?? [];
      list.push({
        name: opponent,
        image: heroImages.get(identityKey(opponent)) ?? null,
        games,
        wins,
        losses: games - wins,
        winRate: games > 0 ? wins / games : 0,
      });
      opponentStats.set(identityKey(hero), list);
    };
    record(matchup.heroA, matchup.heroB, matchup.winsA, matchup.games);
    record(matchup.heroB, matchup.heroA, matchup.winsB, matchup.games);
  }

  /*
   * The 1 vs 1 records above already exist as the matchup matrix; move them
   * into the per-mode table so both modes share one representation, then
   * merge the two modes into the overall table used by the nemesis blocks.
   */
  opponentStats1v1.clear();
  for (const [key, list] of opponentStats) {
    opponentStats1v1.set(key, list);
  }
  opponentStats.clear();
  for (const [key, list] of opponentStats1v1) {
    opponentStats.set(key, list.map((entry) => ({ ...entry })));
  }
  for (const [key, list] of opponentStats2v2) {
    opponentStats.set(key, mergeOpponents(opponentStats.get(key) ?? [], list));
  }

  // Every opponent entry knows its artwork.
  for (const list of opponentStats.values()) {
    for (const entry of list) {
      entry.image = heroImages.get(identityKey(entry.name)) ?? null;
    }
  }
  for (const table of [opponentStats1v1, opponentStats2v2]) {
    for (const list of table.values()) {
      for (const entry of list) {
        entry.image = heroImages.get(identityKey(entry.name)) ?? null;
      }
    }
  }

  // ------------------------------------------------------------------
  // Battlefield statistics — unknown / unnamed maps never enter the ratings.
  // ------------------------------------------------------------------
  const mapStats: Array<MapStats & { key: string }> = [...mapAgg.entries()].map(([key, agg]) => {
    const topHeroEntry = [...agg.heroes.values()].sort((a, b) => b.games - a.games)[0] ?? null;
    const topHero = topHeroEntry
      ? { name: topHeroEntry.display, games: topHeroEntry.games }
      : null;
    // The hero that wins most often on this battlefield.
    const topWinningHeroEntry = [...agg.heroes.values()].sort(
      (a, b) => b.wins - a.wins || b.games - a.games,
    )[0] ?? null;
    const topWinningHero = topWinningHeroEntry && topWinningHeroEntry.wins > 0
      ? {
          name: topWinningHeroEntry.display,
          wins: topWinningHeroEntry.wins,
          games: topWinningHeroEntry.games,
        }
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
    const firstTurnWinRate = agg.matches > 0 ? agg.firstTurnWins / agg.matches : 0;
    return {
      key,
      name: '',
      image: mapImages.get(key) ?? null,
      matches: agg.matches,
      games: agg.games,
      wins: agg.wins,
      winRate: agg.games > 0 ? agg.wins / agg.games : 0,
      firstTurnWinRate,
      // 0 = the battlefield is perfectly even, 1 = one side always wins.
      balance: Math.abs(firstTurnWinRate - 0.5) * 2,
      topHero,
      topWinningHero,
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
    if (!entry.image) entry.image = mapImages.get(entry.key) ?? null;
  }
  mapStats.sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name, 'ru'));

  const mostPopularMapEntry = mapStats[0];
  const mostPopularMap = mostPopularMapEntry
    ? {
        name: mostPopularMapEntry.name,
        games: mostPopularMapEntry.matches,
        winRate: mostPopularMapEntry.winRate,
        image: mostPopularMapEntry.image ?? null,
        topWinningHero: mostPopularMapEntry.topWinningHero ?? null,
      }
    : null;

  // ------------------------------------------------------------------
  // Hero profiles — the data behind the global hero modal.
  // ------------------------------------------------------------------
  const heroHomebrew = new Map(reference.heroes.map((h) => [identityKey(h.name), h.homebrew]));
  const synergiesByHero = new Map<string, PairSynergy[]>();
  for (const pair of heroSynergies) {
    for (const member of pair.members) {
      const key = identityKey(member);
      const list = synergiesByHero.get(key) ?? [];
      list.push(pair);
      synergiesByHero.set(key, list);
    }
  }

  const heroProfiles: HeroProfile[] = heroes.map((hero) => {
    const key = identityKey(hero.name);
    const opponents = opponentStats.get(key) ?? [];
    const opponents1v1 = opponentStats1v1.get(key) ?? [];
    const opponents2v2 = opponentStats2v2.get(key) ?? [];

    /*
     * Nemesis / best victim — calculated for the whole history and, in
     * addition, separately for 1 vs 1 and 2 vs 2. The rules live in
     * `pickNemesis`: only opponents with at least MIN_GAMES_FOR_NEMESIS
     * meetings qualify, the nemesis is the one with the lowest win rate and
     * the best victim the one with the highest — and they are always
     * different characters when more than one opponent qualifies.
     */
    const overall = pickNemesis(opponents);
    const duel = pickNemesis(opponents1v1);
    const team = pickNemesis(opponents2v2);

    const worstEnemy = overall.worst;
    const bestVictim = overall.best;
    const syn = synergiesByHero.get(key) ?? [];
    const bestSynergy = syn.length > 0 ? syn[0] : null;
    const worstSynergy = syn.length > 0 ? syn[syn.length - 1] : null;
    const favoriteMapEntry = hero.topMaps[0] ?? null;

    return {
      name: hero.name,
      image: hero.image ?? null,
      homebrew: heroHomebrew.get(key) ?? isHomebrew(hero.name),
      tier: tierFor(hero.winRate, hero.games),
      games: hero.games,
      wins: hero.wins,
      losses: hero.losses,
      winRate: hero.winRate,
      games1v1: hero.games1v1,
      winRate1v1: hero.winRate1v1,
      games2v2: hero.games2v2,
      winRate2v2: hero.winRate2v2,
      pickRate: validMatches > 0 ? hero.games / validMatches : 0,
      bestVictim,
      worstEnemy,
      worstEnemy1v1: duel.worst,
      bestVictim1v1: duel.best,
      worstEnemy2v2: team.worst,
      bestVictim2v2: team.best,
      favoriteMap: favoriteMapEntry
        ? {
            name: pickDisplayName(referenceSpellings.get(mapKey(favoriteMapEntry.name)) ?? []) ||
              favoriteMapEntry.name,
            games: favoriteMapEntry.games,
            image: mapImages.get(mapKey(favoriteMapEntry.name)) ?? null,
          }
        : null,
      topMaps: hero.topMaps.map((map) => ({
        name: pickDisplayName(referenceSpellings.get(mapKey(map.name)) ?? []) || map.name,
        games: map.games,
      })),
      bestSynergy,
      worstSynergy,
      // Worst opponents first (this hero struggles against them) and best
      // first (this hero beats them).
      nemesis: [...opponents].sort(
        (a, b) => a.winRate - b.winRate || b.games - a.games || a.name.localeCompare(b.name, 'ru'),
      ),
      victims: [...opponents].sort(
        (a, b) => b.winRate - a.winRate || b.games - a.games || a.name.localeCompare(b.name, 'ru'),
      ),
      opponents1v1: [...opponents1v1].sort(
        (a, b) => a.winRate - b.winRate || b.games - a.games || a.name.localeCompare(b.name, 'ru'),
      ),
      opponents2v2: [...opponents2v2].sort(
        (a, b) => a.winRate - b.winRate || b.games - a.games || a.name.localeCompare(b.name, 'ru'),
      ),
    };
  });

  const heroBreakdown: HeroBreakdown = reference.heroes.reduce<HeroBreakdown>(
    (acc, hero) => {
      acc.total += 1;
      if (hero.homebrew || isHomebrew(hero.name)) acc.homebrew += 1;
      else acc.official += 1;
      return acc;
    },
    {
      total: 0,
      official: 0,
      homebrew: 0,
      officialMatches,
      homebrewMatches,
      officialSlots,
      homebrewSlots,
    },
  );

  const firstTurn: FirstTurnBalance[] = (['1v1', '2v2'] as GameMode[]).map((mode) => {
    const agg = firstTurnAgg[mode];
    return {
      mode,
      matches: agg.matches,
      firstTurnWins: agg.first,
      secondTurnWins: agg.second,
      firstTurnWinRate: agg.matches > 0 ? agg.first / agg.matches : 0,
    };
  });

  /* ------------------------------------------------------------------
   * Self-check.
   *
   * The aggregation is verified instead of trusted:
   *   1. every hero total must equal games1v1 + games2v2;
   *   2. hero and player counts are compared against the sheet's curated
   *      per-mode match sheets, an independent copy of the history.
   * Any divergence is reported in the data-quality panel.
   * ------------------------------------------------------------------ */
  const heroTotalViolations = heroes
    .filter((hero) => hero.games !== hero.games1v1 + hero.games2v2)
    .map((hero) => ({
      name: hero.name,
      games: hero.games,
      games1v1: hero.games1v1,
      games2v2: hero.games2v2,
    }));

  const crossCheck = buildCrossCheck(options.curated, heroes, players);

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
      uniquePlayers: players.length,
    },
    players,
    heroes,
    playerLeaders: rateSorted(players, MIN_GAMES_FOR_PLAYER_RATE).slice(0, 10),
    heroLeaders: rateSorted(heroes, MIN_GAMES_FOR_HERO_RATE).slice(0, 10),
    mostPlayedHero,
    mostPopularMap,
    maps: mapStats.map(({ key: _key, ...rest }) => rest),
    bestHeroSynergy,
    bestPlayerSynergy,
    heroSynergies,
    playerSynergies,
    antiSynergies,
    matchups,
    heroProfiles,
    firstTurn,
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
    consistency: {
      heroTotalsOk: heroTotalViolations.length === 0,
      heroTotalViolations,
      crossCheck,
    },
    rejectedRows: options.rejectedRows ?? [],
  };
}

/**
 * Compare the computed hero/player counts against the sheet's curated
 * per-mode match sheets.
 *
 * The curated sheets are a manual split of the same history, so any hero or
 * player whose count differs means one of the two copies is incomplete — a row
 * that never reached the form responses, or a row that was added to the
 * curated sheet only.
 */
function buildCrossCheck(
  curated: { oneVsOne: CuratedAppearance[]; twoVsTwo: CuratedAppearance[] } | undefined,
  heroes: DetailedRecord[],
  players: DetailedRecord[],
): DashboardStats['consistency']['crossCheck'] {
  const empty = {
    available: false,
    heroes: {
      sheet: 0,
      app: 0,
      mismatches: [] as Array<{ name: string; sheet: number; app: number }>,
    },
    players: {
      sheet: 0,
      app: 0,
      mismatches: [] as Array<{ name: string; sheet: number; app: number }>,
    },
  };
  if (!curated) return empty;

  const rows = [...curated.oneVsOne, ...curated.twoVsTwo];
  if (rows.length === 0) return empty;

  // Heroes: one game per seat, skipping placeholders and the denylisted name.
  const sheetHeroes = new Map<string, { display: string; count: number }>();
  for (const row of rows) {
    for (const hero of row.heroes) {
      if (!hero || isPlaceholder(hero) || isExcludedHero(hero)) continue;
      const key = identityKey(hero);
      const entry = sheetHeroes.get(key) ?? { display: hero, count: 0 };
      entry.count += 1;
      sheetHeroes.set(key, entry);
    }
  }

  // Players: one game per distinct player in the row — a dual-control player
  // occupies two seats but that is a single game, same rule as the engine.
  const sheetPlayers = new Map<string, { display: string; count: number }>();
  for (const row of rows) {
    const seen = new Set<string>();
    for (const player of row.players) {
      if (!player || isPlaceholder(player)) continue;
      const key = identityKey(player);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = sheetPlayers.get(key) ?? { display: player, count: 0 };
      entry.count += 1;
      sheetPlayers.set(key, entry);
    }
  }

  const compare = (
    sheet: Map<string, { display: string; count: number }>,
    app: DetailedRecord[],
  ) => {
    const appByKey = new Map(app.map((r) => [identityKey(r.name), r]));
    const mismatches: Array<{ name: string; sheet: number; app: number }> = [];
    const names = new Set([...sheet.keys(), ...appByKey.keys()]);
    for (const key of names) {
      const sheetCount = sheet.get(key)?.count ?? 0;
      const appCount = appByKey.get(key)?.games ?? 0;
      if (sheetCount !== appCount) {
        mismatches.push({
          name: sheet.get(key)?.display ?? appByKey.get(key)?.name ?? key,
          sheet: sheetCount,
          app: appCount,
        });
      }
    }
    mismatches.sort((a, b) => b.sheet - a.sheet || a.name.localeCompare(b.name, 'ru'));
    return {
      sheet: [...sheet.values()].reduce((sum, e) => sum + e.count, 0),
      app: app.reduce((sum, r) => sum + r.games, 0),
      mismatches,
    };
  };

  return {
    available: true,
    heroes: compare(sheetHeroes, heroes),
    players: compare(sheetPlayers, players),
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
  images: ImageIndex,
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

  const maps: Array<{ name: string; mode: GameMode; image: string | null }> = [];
  for (const entry of mapModes.values()) {
    const display =
      entry.curated.length > 0
        ? pickDisplayName(entry.curated)
        : pickDisplayName(entry.spellings);
    const image = images.maps[mapKey(display)] ?? null;
    for (const mode of entry.modes) maps.push({ name: display, mode, image });
  }
  maps.sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.mode.localeCompare(b.mode));

  return { players, heroes, maps };
}

/** Assemble the full payload sent to the client. */
export function buildAppData(
  matches: Match[],
  listRows: string[][],
  images: ImageIndex,
  meta: AppData['meta'],
  rejected: Array<{ rowNumber: number; reason: string }>,
  curated?: { oneVsOne: CuratedAppearance[]; twoVsTwo: CuratedAppearance[] },
): AppData {
  const reference = buildReference(listRows, matches, images);
  const stats = computeStats(matches, reference, { rejectedRows: rejected, curated });
  return { matches, reference, stats, meta };
}
