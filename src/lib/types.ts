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
  /** Number of matches played on this battlefield. */
  matches: number;
  /** Player-games played on this battlefield. */
  games: number;
  wins: number;
  winRate: number;
  /** Hero played most often on this battlefield. */
  topHero: { name: string; games: number } | null;
  /** Player who won most often on this battlefield. */
  topPlayer: { name: string; wins: number; games: number } | null;
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
  };
  players: DetailedRecord[];
  heroes: DetailedRecord[];
  /** Player leaders by win rate (min. games threshold applied). */
  playerLeaders: DetailedRecord[];
  heroLeaders: DetailedRecord[];
  /** Hero with the highest number of games played. */
  mostPlayedHero: DetailedRecord | null;
  /** Map used in the most matches (never an unknown/unnamed battlefield). */
  mostPopularMap: { name: string; games: number; winRate: number } | null;
  /** Per-map statistics, sorted by number of matches. */
  maps: MapStats[];
  /** Highest win-rate hero duo in 2v2. */
  bestHeroSynergy: PairSynergy[];
  /** Highest win-rate player duo in 2v2. */
  bestPlayerSynergy: PairSynergy[];
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
