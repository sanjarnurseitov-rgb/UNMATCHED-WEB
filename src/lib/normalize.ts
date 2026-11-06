/**
 * Name normalization for the Unmatched sheet.
 *
 * The sheet was filled in by hand and by a Google Form for ~4 years, so the
 * same entity shows up with different spellings:
 *
 *   "Ти‑Рекс" (U+2011 non-breaking hyphen)  vs  "Ти-Рекс"
 *   "Чёрная Пантера"                          vs  "Черная Пантера"
 *   "Ведьмак (Фан)"                           vs  "Ведьмак(фан)"
 *   "Миша БОНС"                               vs  "Миша Бонс"
 *
 * `canonicalName` folds all of these into one bucket so that a hero's win rate
 * is not split across three leaderboard rows.
 */

const HOMEBREW_SUFFIX = /\(\s*фан\s*\)/i;

/** Replace exotic dashes/hyphens and normalise whitespace. */
export function canonicalName(input: string): string {
  return input
    .replace(/\u2010|\u2011|\u2012|\u2013|\u2014|\u2212|\uFE58|\uFE63|\uFF0D/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A looser key used only for grouping/equality checks: case folded, "ё"
 * folded to "е", homebrew suffix spacing removed.
 */
export function identityKey(input: string): string {
  return canonicalName(input)
    .replace(/\s*\(\s*фан\s*\)/gi, '(фан)')
    .replace(/ё/g, 'е')
    .replace(/е/g, 'е')
    .toLowerCase();
}

/** True when the name marks an unofficial / homebrew character. */
export function isHomebrew(name: string): boolean {
  return HOMEBREW_SUFFIX.test(name);
}

/**
 * Produce the display name for a group of raw spellings: the most frequent
 * spelling wins, ties broken by the shortest string then alphabetically.
 */
export function pickDisplayName(names: string[]): string {
  if (names.length === 0) return '';
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    if (a[0].length !== b[0].length) return a[0].length - b[0].length;
    return a[0].localeCompare(b[0], 'ru');
  })[0][0];
}

/**
 * Group raw names into canonical buckets.
 * Returns a map from identity key -> { display, raw }.
 */
export function groupNames(names: string[]): Map<string, { display: string; raw: string[] }> {
  const buckets = new Map<string, { display: string; raw: string[] }>();
  for (const raw of names) {
    const clean = canonicalName(raw);
    if (!clean) continue;
    const key = identityKey(clean);
    const bucket = buckets.get(key);
    if (bucket) bucket.raw.push(clean);
    else buckets.set(key, { display: clean, raw: [clean] });
  }
  for (const bucket of buckets.values()) bucket.display = pickDisplayName(bucket.raw);
  return buckets;
}

/**
 * Parse the sheet's timestamp column.
 *
 * Observed formats in the live sheet:
 *   "09.03.2024"                       (date only)
 *   "03.02.2026 23:50:11"             (date + time)
 *   "29.10.2026 1:12:16"              (single-digit hour — no zero padding)
 *   ""                                 (missing on ~24% of rows)
 *
 * Returns an ISO string when the value can be understood, otherwise null.
 */
export function parseTimestamp(raw: string): string | null {
  const value = canonicalName(raw ?? '');
  if (!value) return null;

  const m = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    const [, d, mo, y, h = '0', mi = '0', s = '0'] = m;
    const dt = new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(s),
    );
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  // Fallback: let JS try (ISO strings, or locale-ish values).
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();

  return null;
}

/** Format a Date into the sheet's `dd.MM.yyyy HH:mm:ss` convention. */
export function formatSheetDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getDate())}.${p(date.getMonth() + 1)}.${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

export { };
