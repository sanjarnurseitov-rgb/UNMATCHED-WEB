/**
 * Match results.
 *
 * Small helpers shared by the statistics engine (server) and the interactive
 * components (client): who won which seats, and whether a given player won
 * a given match.
 *
 * The sheet encodes the winner positionally:
 *   1 vs 1 — "Игрок 1" / "Игрок 2"  → winner 'p1' / 'p2'
 *   2 vs 2 — "Команда 1" / "Команда 2" → winner 't1' / 't2'
 */
import { identityKey, isPlaceholder } from './normalize';
import type { Match } from './types';

/** Who won, expressed as the set of winning seats (0-based within the match). */
export function winningSeats(match: Match): Set<number> {
  const seats = new Set<number>();
  if (match.mode === '1v1') {
    if (match.winner === 'p1') seats.add(0);
    else if (match.winner === 'p2') seats.add(1);
  } else if (match.winner === 't1') {
    seats.add(0);
    seats.add(1);
  } else if (match.winner === 't2') {
    seats.add(2);
    seats.add(3);
  }
  return seats;
}

/**
 * Whether the given seat won.
 *
 * In 2 vs 2 both seats of a team share the team's result, which is what makes
 * a dual-control player (one player on both seats of a team) resolve correctly.
 */
export function seatWon(match: Match, seat: number, winning: Set<number>): boolean {
  if (match.mode === '1v1') return winning.has(seat);
  const team = seat < 2 ? 1 : 2;
  return team === 1 ? winning.has(0) : winning.has(2);
}

/**
 * The result of a match for one player.
 *
 * Returns `null` when the match has no recorded winner or the player is not
 * part of it.
 */
export function resultForPlayer(
  match: Match,
  playerName: string,
): 'win' | 'loss' | 'draw' | null {
  if (!match.winner) return null;
  const key = identityKey(playerName);
  const winning = winningSeats(match);
  const seats = match.players
    .map((player, seat) => ({ player, seat }))
    .filter((entry) => entry.player && !isPlaceholder(entry.player))
    .filter((entry) => identityKey(entry.player) === key)
    .map((entry) => entry.seat);
  if (seats.length === 0) return null;
  const won = seats.some((seat) => seatWon(match, seat, winning));
  return won ? 'win' : 'loss';
}

/** Sort key for "newest first" ordering. */
export function matchRecency(match: Match): number {
  if (match.timestamp) {
    const time = Date.parse(match.timestamp);
    if (!Number.isNaN(time)) return time;
  }
  // Rows entered later in the sheet are newer.
  return match.rowNumber;
}
