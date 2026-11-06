/**
 * Parser turning raw "Ответы на форму (3)" sheet rows into normalized matches.
 *
 * The sheet is a Google Form response sheet with 22 columns. A 1v1 match fills
 * columns C..J, a 2v2 match fills columns K..V, and columns A (timestamp) and
 * B (mode) are shared by both.
 */
import { canonicalName, identityKey, parseTimestamp } from './normalize';
import type { DualControl, GameMode, Match, Winner } from './types';

export const MATCH_COLUMNS = {
  timestamp: 0,
  mode: 1,
  p1: 2,
  h1: 3,
  p2: 4,
  h2: 5,
  map1v1: 6,
  winner1v1: 7,
  comment1v1: 8,
  location1v1: 9,
  map2v2: 10,
  t1p1: 11,
  t1h1: 12,
  t1p2: 13,
  t1h2: 14,
  t2p3: 15,
  t2h3: 16,
  t2p4: 17,
  t2h4: 18,
  winner2v2: 19,
  comment2v2: 20,
  location2v2: 21,
} as const;

export const MATCH_HEADERS = [
  'Отметка времени',
  'Режим игры',
  'Игрок 1',
  'Герой 1',
  'Игрок 2',
  'Герой 2',
  'Поле 1 vs 1',
  'Победитель 1 vs 1',
  'Комментарий 1 vs 1',
  'Локация матча 1 vs 1',
  'Поле 2 vs 2',
  'Команда 1 Игрок 1',
  'Команда 1 Герой 1',
  'Команда 1 Игрок 2',
  'Команда 1 Герой 2',
  'Команда 2 Игрок 3',
  'Команда 2 Герой 3',
  'Команда 2 Игрок 4',
  'Команда 2 Герой 4',
  'Победитель',
  'Комментарий',
  'Локация матча',
];

/** Normalised mode strings -> internal mode. */
export function parseMode(raw: string): GameMode | null {
  const value = canonicalName(raw).toLowerCase().replace(/\s+/g, '');
  if (value === '1vs1') return '1v1';
  if (value === '2vs2') return '2v2';
  return null;
}

function cell(row: string[], index: number): string {
  const value = row[index];
  return typeof value === 'string' ? canonicalName(value) : '';
}

/**
 * Detect a "1 player vs 2 players" match: the same player sits in both seats
 * of one team and therefore controls two heroes against two opponents.
 */
function detectDualControl(
  players: [string, string],
  heroes: [string, string],
  team: 1 | 2,
): DualControl | null {
  if (!players[0] || !players[1]) return null;
  if (identityKey(players[0]) !== identityKey(players[1])) return null;
  return {
    player: players[0],
    team,
    heroes: [heroes[0] ?? '', heroes[1] ?? ''],
  };
}

/**
 * Parse one sheet row into a `Match`.
 * `rowNumber` is the 1-based spreadsheet row (header is row 1).
 */
export function parseMatchRow(rawRow: string[], rowNumber: number): Match {
  const row = [...rawRow];
  while (row.length < MATCH_COLUMNS.location2v2 + 1) row.push('');

  const issues: string[] = [];
  const mode = parseMode(cell(row, MATCH_COLUMNS.mode));
  const timestampRaw = cell(row, MATCH_COLUMNS.timestamp);
  const timestamp = parseTimestamp(timestampRaw);

  const base: Match = {
    id: `r${rowNumber}`,
    rowNumber,
    timestamp,
    timestampRaw,
    mode: mode ?? '1v1',
    players: [],
    heroes: [],
    team1Players: [],
    team1Heroes: [],
    team2Players: [],
    team2Heroes: [],
    map: null,
    winner: null,
    comment: null,
    location: null,
    valid: false,
    issues,
    dualControl: [],
  };

  if (!mode) {
    issues.push('Неизвестный режим игры');
    return base;
  }

  if (!timestamp) {
    issues.push('Нет корректной отметки времени');
  }

  if (mode === '1v1') {
    const players = [cell(row, MATCH_COLUMNS.p1), cell(row, MATCH_COLUMNS.p2)];
    const heroes = [cell(row, MATCH_COLUMNS.h1), cell(row, MATCH_COLUMNS.h2)];
    const winnerRaw = cell(row, MATCH_COLUMNS.winner1v1);
    const map = cell(row, MATCH_COLUMNS.map1v1);

    base.players = players;
    base.heroes = heroes;
    base.map = map || null;
    base.comment = cell(row, MATCH_COLUMNS.comment1v1) || null;
    base.location = cell(row, MATCH_COLUMNS.location1v1) || null;

    if (winnerRaw === 'Игрок 1') base.winner = 'p1';
    else if (winnerRaw === 'Игрок 2') base.winner = 'p2';
    else issues.push('Не указан победитель');

    if (!players[0] || !players[1]) issues.push('Не заполнены игроки');
    if (!heroes[0] || !heroes[1]) issues.push('Не заполнены герои');
  } else {
    const team1Players = [cell(row, MATCH_COLUMNS.t1p1), cell(row, MATCH_COLUMNS.t1p2)];
    const team1Heroes = [cell(row, MATCH_COLUMNS.t1h1), cell(row, MATCH_COLUMNS.t1h2)];
    const team2Players = [cell(row, MATCH_COLUMNS.t2p3), cell(row, MATCH_COLUMNS.t2p4)];
    const team2Heroes = [cell(row, MATCH_COLUMNS.t2h3), cell(row, MATCH_COLUMNS.t2h4)];
    const winnerRaw = cell(row, MATCH_COLUMNS.winner2v2);
    const map = cell(row, MATCH_COLUMNS.map2v2);

    base.players = [...team1Players, ...team2Players];
    base.heroes = [...team1Heroes, ...team2Heroes];
    base.team1Players = team1Players;
    base.team1Heroes = team1Heroes;
    base.team2Players = team2Players;
    base.team2Heroes = team2Heroes;
    base.map = map || null;
    base.comment = cell(row, MATCH_COLUMNS.comment2v2) || null;
    base.location = cell(row, MATCH_COLUMNS.location2v2) || null;

    if (winnerRaw === 'Команда 1') base.winner = 't1';
    else if (winnerRaw === 'Команда 2') base.winner = 't2';
    else issues.push('Не указан победитель');

    if (team1Players.some((p) => !p) || team2Players.some((p) => !p)) {
      issues.push('Не заполнены игроки');
    }
    if (team1Heroes.some((h) => !h) || team2Heroes.some((h) => !h)) {
      issues.push('Не заполнены герои');
    }

    // One player controlling two heroes on the same team.
    const dual1 = detectDualControl(
      [team1Players[0], team1Players[1]],
      [team1Heroes[0], team1Heroes[1]],
      1,
    );
    const dual2 = detectDualControl(
      [team2Players[0], team2Players[1]],
      [team2Heroes[0], team2Heroes[1]],
      2,
    );
    if (dual1) base.dualControl.push(dual1);
    if (dual2) base.dualControl.push(dual2);
  }

  // Hero-uniqueness rule: the same hero cannot appear twice in one match.
  const seen = new Set<string>();
  for (const hero of base.heroes) {
    if (!hero) continue;
    if (seen.has(hero)) issues.push(`Герой «${hero}» повторяется в матче`);
    seen.add(hero);
  }

  // A missing timestamp is a data-hygiene issue, not a reason to drop the
  // match: it still happened and still counts for win/loss statistics.
  base.valid = !issues.some((issue) => issue !== 'Нет корректной отметки времени');
  return base;
}

/**
 * Parse a whole sheet: first row is the header, the rest are matches.
 * Rows that are entirely empty are skipped.
 */
export function parseMatchesSheet(rows: string[][]): {
  matches: Match[];
  rejected: Array<{ rowNumber: number; reason: string }>;
} {
  const matches: Match[] = [];
  const rejected: Array<{ rowNumber: number; reason: string }> = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    if (rowNumber === 1) return; // header
    if (row.every((c) => !c || !String(c).trim())) return;

    const match = parseMatchRow(row, rowNumber);
    matches.push(match);

    const fatal = match.issues.filter((i) => i !== 'Нет корректной отметки времени');
    if (fatal.length > 0) {
      rejected.push({ rowNumber, reason: fatal.join('; ') });
    }
  });

  return { matches, rejected };
}

/**
 * Build the row to append to the sheet for a new match.
 * Mirrors exactly how the Google Form writes, so existing pivot formulas keep
 * working and the sheet stays consistent.
 */
export function buildSheetRow(input: {
  mode: GameMode;
  timestamp: string;
  players: string[];
  heroes: string[];
  map?: string | null;
  winner: 'p1' | 'p2' | 't1' | 't2';
  comment?: string | null;
  location?: string | null;
}): string[] {
  const row = new Array<string>(22).fill('');
  row[MATCH_COLUMNS.timestamp] = input.timestamp;
  row[MATCH_COLUMNS.mode] = input.mode === '1v1' ? '1 vs 1' : '2 vs 2';

  if (input.mode === '1v1') {
    row[MATCH_COLUMNS.p1] = input.players[0] ?? '';
    row[MATCH_COLUMNS.h1] = input.heroes[0] ?? '';
    row[MATCH_COLUMNS.p2] = input.players[1] ?? '';
    row[MATCH_COLUMNS.h2] = input.heroes[1] ?? '';
    row[MATCH_COLUMNS.map1v1] = input.map ?? '';
    row[MATCH_COLUMNS.winner1v1] = input.winner === 'p1' ? 'Игрок 1' : 'Игрок 2';
    row[MATCH_COLUMNS.comment1v1] = input.comment ?? '';
    row[MATCH_COLUMNS.location1v1] = input.location ?? '';
  } else {
    row[MATCH_COLUMNS.map2v2] = input.map ?? '';
    row[MATCH_COLUMNS.t1p1] = input.players[0] ?? '';
    row[MATCH_COLUMNS.t1h1] = input.heroes[0] ?? '';
    row[MATCH_COLUMNS.t1p2] = input.players[1] ?? '';
    row[MATCH_COLUMNS.t1h2] = input.heroes[1] ?? '';
    row[MATCH_COLUMNS.t2p3] = input.players[2] ?? '';
    row[MATCH_COLUMNS.t2h3] = input.heroes[2] ?? '';
    row[MATCH_COLUMNS.t2p4] = input.players[3] ?? '';
    row[MATCH_COLUMNS.t2h4] = input.heroes[3] ?? '';
    row[MATCH_COLUMNS.winner2v2] = input.winner === 't1' ? 'Команда 1' : 'Команда 2';
    row[MATCH_COLUMNS.comment2v2] = input.comment ?? '';
    row[MATCH_COLUMNS.location2v2] = input.location ?? '';
  }

  return row;
}
