/**
 * Core domain types for the Unmatched match tracker.
 *
 * The spreadsheet stores matches in a "form responses" shape: one wide row per
 * match where a 1v1 match fills columns B..J and a 2v2 match fills columns
 * K..V. Everything downstream works on the normalized `Match` shape below.
 */

export type GameMode = '1v1' | '2v2';

export type Winner = 'p1' | 'p2' | 't1' | 't2';

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
  /** Top heroes for the entry, most played first. */
  topHeroes: Array<{ name: string; games: number; wins: number; winRate: number }>;
  /** Top maps for the entry, most played first. */
  topMaps: Array<{ name: string; games: number }>;
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
  };
  players: DetailedRecord[];
  heroes: DetailedRecord[];
  /** Player leaders by win rate (min. games threshold applied). */
  playerLeaders: DetailedRecord[];
  heroLeaders: DetailedRecord[];
  /** Hero with the highest number of games played. */
  mostPlayedHero: DetailedRecord | null;
  /** Map used in the most matches. */
  mostPopularMap: { name: string; games: number; winRate: number } | null;
  /** Per-map statistics, sorted by number of matches. */
  maps: Array<{ name: string; matches: number; games: number; wins: number; winRate: number }>;
  /** Highest win-rate hero duo in 2v2. */
  bestHeroSynergy: PairSynergy[];
  /** Highest win-rate player duo in 2v2. */
  bestPlayerSynergy: PairSynergy[];
  /** Most frequent player+hero pairing. */
  favouriteCombos: Array<{ player: string; hero: string; games: number; wins: number; winRate: number }>;
  /** Matches per month, for the activity chart. */
  timeline: Array<{ month: string; matches: number; wins: number; losses: number }>;
  /** Games per mode over time. */
  modeSplit: Array<{ mode: GameMode; matches: number }>;
  headToHead: HeadToHead[];
  /** Rows that could not be parsed, surfaced in the UI for data hygiene. */
  rejectedRows: Array<{ rowNumber: number; reason: string }>;
  /**
   * Rows where the same player occupies two seats of one team. Such rows are
   * kept (the match happened) but the player is counted only once.
   */
  degenerateRows: number;
}

/** Everything the client needs to render the app. */
export interface AppData {
  matches: Match[];
  reference: ReferenceData;
  stats: DashboardStats;
  meta: {
    source: 'api' | 'public' | 'snapshot';
    canWrite: boolean;
    spreadsheetId: string;
    fetchedAt: string;
  };
}
