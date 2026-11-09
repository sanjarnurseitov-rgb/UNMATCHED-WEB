/**
 * Core domain types for the Unmatched match tracker.
 *
 * The spreadsheet stores matches in a "form responses" shape: one wide row per
 * match where a 1v1 match fills columns B..J and a 2v2 match fills columns
 * K..V. Everything downstream works on the normalized `Match` shape below.
 */

export type GameMode = '1v1' | '2v2';

export type Winner = 'p1' | 'p2' | 't1' | 't2';

/** Bucket used for matches recorded without a battlefield. */
export const UNSPECIFIED_MAP = 'Не указано';

/**
 * A 2v2 match where a single player controls both heroes of their team and
 * faces two different opponents. In the sheet this looks like the same player
 * name appearing in both seats of one team.
 */
export interface DualControl {
  /** The player who controlled both heroes. */
  player: string;
  /** Which team they played for. */
  team: 1 | 2;
  /** The two heroes they controlled. */
  heroes: [string, string];
}

export interface Match {
  /** Stable id: sheet row number, e.g. "r42". */
  id: string;
  /** 1-based row number in the source sheet. */
  rowNumber: number;
  /** ISO timestamp when parseable, otherwise null. */
  timestamp: string | null;
  /** Raw timestamp text as stored in the sheet. */
  timestampRaw: string;
  mode: GameMode;
  /** Players in seat order. 2 entries for 1v1, 4 for 2v2. */
  players: string[];
  /** Heroes in seat order. Same length as `players`. */
  heroes: string[];
  /** Team 1 seats (2v2 only). Empty for 1v1. */
  team1Players: string[];
  team1Heroes: string[];
  team2Players: string[];
  team2Heroes: string[];
  /** Battlefield name, or null when the row has no map recorded. */
  map: string | null;
  winner: Winner | null;
  comment: string | null;
  location: string | null;
  /** True when the row is structurally complete enough to be counted. */
  valid: boolean;
  /** Human-readable reason a row was rejected (if any). */
  issues: string[];
  /**
   * 2v2 matches where one player controlled two heroes. Empty for 1v1 and
   * for ordinary 2v2 matches.
   */
  dualControl: DualControl[];
}

export interface PlayerEntry {
  name: string;
  /** Image URL for the avatar, if one has been registered. */
  image?: string | null;
}

export interface HeroEntry {
  name: string;
  /** True for unofficial / homebrew characters (e.g. "Зератул(фан)"). */
  homebrew: boolean;
  image?: string | null;
}

export interface MapEntry {
  name: string;
  mode: GameMode;
  /** Battlefield artwork from the IMAGES tab, if available. */
  image?: string | null;
}

export interface ReferenceData {
  players: PlayerEntry[];
  heroes: HeroEntry[];
  maps: MapEntry[];
}

export interface WinRecord {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface DetailedRecord extends WinRecord {
  name: string;
  image?: string | null;
  games1v1: number;
  games2v2: number;
  wins1v1: number;
  wins2v2: number;
  /** Losses in 1 vs 1. */
  losses1v1: number;
  /** Losses in 2 vs 2. */
  losses2v2: number;
  /** Win rate in 1 vs 1 (0 when there were no 1 vs 1 games). */
  winRate1v1: number;
  /** Win rate in 2 vs 2 (0 when there were no 2 vs 2 games). */
  winRate2v2: number;
  /** Matches where this player controlled two heroes at once. */
  dualGames: number;
  /** Top heroes for the entry, most played first. */
  topHeroes: Array<{ name: string; games: number; wins: number; winRate: number }>;
  /** Top maps for the entry, most played first. */
  topMaps: Array<{ name: string; games: number }>;
}

/** Per-battlefield statistics. */
export interface MapStats {
  name: string;
  /** Battlefield artwork from the IMAGES tab, if available. */
  image?: string | null;
  /** Number of matches played on this battlefield. */
  matches: number;
  /** Player-games played on this battlefield. */
  games: number;
  wins: number;
  winRate: number;
  /** Share of matches won by whoever had the first turn. */
  firstTurnWinRate: number;
  /** How balanced the battlefield is: 0 = perfectly even, 1 = one-sided. */
  balance: number;
  /** Hero played most often on this battlefield. */
  topHero: { name: string; games: number } | null;
  /** Player who won most often on this battlefield. */
  topPlayer: { name: string; wins: number; games: number } | null;
}

/** Performance tier of a hero. */
export type HeroTier = 'S' | 'A' | 'B' | 'C' | 'D';

/** Head-to-head record of one hero against another. */
export interface OpponentStat {
  name: string;
  image?: string | null;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}

/** A 1 vs 1 hero matchup, aggregated over every meeting of the pair. */
export interface Matchup {
  heroA: string;
  heroB: string;
  games: number;
  winsA: number;
  winsB: number;
  /** Win rate of heroA against heroB (0..1). */
  winRateA: number;
}

/**
 * Everything the hero modal needs: overall rating, the two most important
 * opponents, the favourite battlefield and the best duo.
 */
export interface HeroProfile {
  name: string;
  image?: string | null;
  homebrew: boolean;
  tier: HeroTier;
  /** Matches the hero appeared in. */
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  games1v1: number;
  winRate1v1: number;
  games2v2: number;
  winRate2v2: number;
  /** Share of all matches the hero was picked in (0..1). */
  pickRate: number;
  /** Hero this hero beats most often. */
  bestVictim: OpponentStat | null;
  /** Hero that beats this hero most often. */
  worstEnemy: OpponentStat | null;
  /** Battlefield this hero plays on most. */
  favoriteMap: { name: string; games: number; image?: string | null } | null;
  /** Teammate with the best combined win rate. */
  bestSynergy: PairSynergy | null;
  /** Teammate with the worst combined win rate. */
  worstSynergy: PairSynergy | null;
  /** Every opponent, best first. */
  nemesis: OpponentStat[];
  /** Every opponent, worst first. */
  victims: OpponentStat[];
}

/** First-turn balance for one mode. */
export interface FirstTurnBalance {
  mode: GameMode;
  matches: number;
  /** Matches won by the side that moved first. */
  firstTurnWins: number;
  /** Matches won by the side that moved second. */
  secondTurnWins: number;
  firstTurnWinRate: number;
}

export interface PairSynergy {
  /** Sorted pair key, e.g. "Алиса + Синдбад". */
  key: string;
  members: [string, string];
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface HeadToHead {
  a: string;
  b: string;
  games: number;
  winsA: number;
  winsB: number;
}

/** How many heroes exist in the catalogue, split by origin. */
export interface HeroBreakdown {
  /** Every hero known to the app. */
  total: number;
  /** Heroes from the official game. */
  official: number;
  /** Homebrew characters, detected by the "(фан)" tag. */
  homebrew: number;
  /** Matches that featured at least one official hero. */
  officialMatches: number;
  /** Matches that featured at least one homebrew hero. */
  homebrewMatches: number;
  /** Hero slots (seats) taken by official heroes. */
  officialSlots: number;
  /** Hero slots (seats) taken by homebrew heroes. */
  homebrewSlots: number;
}

export interface DashboardStats {
  totals: {
    matches: number;
    validMatches: number;
    wins: number;
    losses: number;
    winRate: number;
    modes: Record<GameMode, number>;
    firstMatch: string | null;
    lastMatch: string | null;
    /** 2v2 matches where one player controlled two heroes. */
    dualControlMatches: number;
    /** Matches recorded without a battlefield. Excluded from map ratings. */
    unmappedMatches: number;
    /** Distinct players across the whole match history. */
    uniquePlayers: number;
  };
  players: DetailedRecord[];
  heroes: DetailedRecord[];
  /** Player leaders by win rate (min. games threshold applied). */
  playerLeaders: DetailedRecord[];
  heroLeaders: DetailedRecord[];
  /** Hero with the highest number of games played. */
  mostPlayedHero: DetailedRecord | null;
  /** Map used in the most matches (never an unknown/unnamed battlefield). */
  mostPopularMap: { name: string; games: number; winRate: number; image?: string | null } | null;
  /** Per-map statistics, sorted by number of matches. */
  maps: MapStats[];
  /** Highest win-rate hero duo in 2v2. */
  bestHeroSynergy: PairSynergy[];
  /** Highest win-rate player duo in 2v2. */
  bestPlayerSynergy: PairSynergy[];
  /** Every hero duo that met often enough to be rated, best first. */
  heroSynergies: PairSynergy[];
  /** Every player duo that met often enough to be rated, best first. */
  playerSynergies: PairSynergy[];
  /** Hero duos with the worst win rate — the anti-synergies. */
  antiSynergies: PairSynergy[];
  /** Every 1 vs 1 hero matchup. */
  matchups: Matchup[];
  /** Full profile of every hero that appeared in a match. */
  heroProfiles: HeroProfile[];
  /** First-turn balance per mode. */
  firstTurn: FirstTurnBalance[];
  /** Most frequent player+hero pairing. */
  favouriteCombos: Array<{ player: string; hero: string; games: number; wins: number; winRate: number }>;
  /** Matches per month, for the activity chart. */
  timeline: Array<{
    month: string;
    matches: number;
    matches1v1: number;
    matches2v2: number;
    wins: number;
    losses: number;
  }>;
  /** Games per mode over time. */
  modeSplit: Array<{ mode: GameMode; matches: number }>;
  headToHead: HeadToHead[];
  /** Rows that could not be parsed, surfaced in the UI for data hygiene. */
  rejectedRows: Array<{ rowNumber: number; reason: string }>;
  /** Hero catalogue split into official and homebrew characters. */
  heroBreakdown: HeroBreakdown;
  /** Self-check of the aggregation — see `ConsistencyReport`. */
  consistency: ConsistencyReport;
}

/**
 * Self-check report.
 *
 * The engine verifies its own aggregation instead of trusting it: every hero
 * total must equal 1 vs 1 appearances + 2 vs 2 appearances, and the counts
 * are cross-checked against the sheet's curated per-mode match sheets.
 */
export interface ConsistencyReport {
  /** True when every hero total equals games1v1 + games2v2. */
  heroTotalsOk: boolean;
  /** Heroes that violate the invariant (empty when everything is fine). */
  heroTotalViolations: Array<{
    name: string;
    games: number;
    games1v1: number;
    games2v2: number;
  }>;
  /** Cross-check against the curated «Матчи 1 на 1» / «Матчи 2 на 2» sheets. */
  crossCheck: {
    /** False when the curated sheets could not be read (check skipped). */
    available: boolean;
    heroes: { sheet: number; app: number; mismatches: Array<{ name: string; sheet: number; app: number }> };
    players: { sheet: number; app: number; mismatches: Array<{ name: string; sheet: number; app: number }> };
  };
}

/** Everything the client needs to render the app. */
export interface AppData {
  matches: Match[];
  reference: ReferenceData;
  stats: DashboardStats;
  meta: {
    source: 'api' | 'public' | 'snapshot';
    spreadsheetId: string;
    fetchedAt: string;
    /** Number of image rows read from the IMAGES tab. */
    imageRows: number;
  };
}
