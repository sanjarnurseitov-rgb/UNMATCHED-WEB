/**
 * Application data loader.
 *
 * Resolves the best available provider, loads the raw sheets, normalizes them
 * into matches + reference lists, and computes the dashboard statistics.
 *
 * The app is read-only: nothing here ever writes back to the spreadsheet.
 */
import { parseCurated1v1, parseCurated2v2, parseMatchesSheet } from './parse';
import { buildAppData, type ImageIndex } from './stats';
import { identityKey, mapKey } from './normalize';
import {
  getProvider,
  publicProvider,
  readCuratedMatchesCached,
  readImagesCached,
  readListsCached,
  readMatchesCached,
  selectedSource,
  spreadsheetId,
  type Provider,
} from './sheets';
import type { AppData } from './types';

export type { ImageIndex };

/** Header names that start a new "Имя | Тип | URL" block. */
const NAME_HEADERS = ['имя', 'name', 'название'];
/** Header names that hold the entity type. */
const TYPE_HEADERS = ['тип', 'type', 'категория'];
/** Header names that hold the image URL. */
const URL_HEADERS = ['url', 'ссылка', 'link', 'картинка', 'изображение'];

/** Normalised entity type used across the app. */
export type ImageKind = 'hero' | 'player' | 'map';

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function headerMatches(value: string, candidates: string[]): boolean {
  const header = normalizeHeader(value);
  return candidates.some((candidate) => header === candidate || header.startsWith(candidate));
}

/**
 * Detect the column blocks of the IMAGES tab from its header row.
 *
 * The live sheet holds two blocks side by side:
 *
 *   Имя | Тип | URL | Имя | Тип
 *
 * — the first one for heroes and players (with artwork), the second one for
 * the battlefields. Because the blocks may grow a URL column at any time, the
 * layout is detected from the headers instead of being hard-coded.
 */
function detectImageBlocks(header: string[]): Array<{ name: number; type: number; url: number }> {
  const blocks: Array<{ name: number; type: number; url: number }> = [];

  header.forEach((cell, index) => {
    if (!headerMatches(cell, NAME_HEADERS)) return;

    const block = { name: index, type: -1, url: -1 };
    for (let i = index + 1; i < header.length; i += 1) {
      const next = header[i];
      if (headerMatches(next, NAME_HEADERS)) break; // next block starts here
      if (block.type < 0 && headerMatches(next, TYPE_HEADERS)) {
        block.type = i;
        continue;
      }
      if (block.url < 0 && headerMatches(next, URL_HEADERS)) block.url = i;
    }
    blocks.push(block);
  });

  return blocks;
}

/**
 * Convert the raw type label into one of the known kinds.
 *
 * The sheet uses `hero`, `player` and `Map`; Russian labels are accepted too.
 */
export function normalizeImageType(raw: string): ImageKind | null {
  const value = normalizeHeader(raw);
  if (!value) return null;
  if (value.startsWith('hero') || value === 'герой' || value === 'герои') return 'hero';
  if (value.startsWith('player') || value === 'игрок' || value === 'игроки') return 'player';
  if (
    value.startsWith('map') ||
    value.startsWith('поле') ||
    value.startsWith('локац') ||
    value.startsWith('location')
  ) {
    return 'map';
  }
  return null;
}

/**
 * Parse the IMAGES tab into lookup maps.
 *
 * Rows are read positionally *and* through the detected header blocks, so both
 * layouts below work:
 *
 *   Имя | Тип | URL
 *   Алиса | hero | https://…
 *
 *   Имя | Тип | URL | Имя | Тип
 *   Алиса | hero | https://… | Marmoreal(Том1) | Map
 */
export function indexImages(rows: string[][]): ImageIndex {
  if (!rows.length) return { players: {}, heroes: {}, maps: {} };

  const index: ImageIndex = { players: {}, heroes: {}, maps: {} };
  const header = rows[0] ?? [];
  const blocks = detectImageBlocks(header);
  const hasHeader = blocks.length > 0;

  // Without a recognisable header we fall back to the classic positional
  // layout: A = name, B = type, C = url.
  const effectiveBlocks = hasHeader
    ? blocks
    : [{ name: 0, type: 1, url: 2 }];
  const body = hasHeader ? rows.slice(1) : rows;

  for (const row of body) {
    for (const block of effectiveBlocks) {
      const name = (row[block.name] ?? '').trim();
      if (!name) continue;
      const type = block.type >= 0 ? normalizeImageType(row[block.type] ?? '') : null;
      if (!type) continue;
      const url = block.url >= 0 ? (row[block.url] ?? '').trim() : '';

      if (type === 'hero') {
        if (url) index.heroes[identityKey(name)] = url;
      } else if (type === 'player') {
        if (url) index.players[identityKey(name)] = url;
      } else {
        // Battlefield artwork. The key is the normalized battlefield key so it
        // matches the names used by the map statistics.
        if (url) index.maps[mapKey(name)] = url;
      }
    }
  }

  return index;
}

/**
 * Load everything. When the primary provider fails (for example the API
 * credentials are wrong), fall back to the credential-free public provider so
 * the dashboard still renders.
 */
export async function loadAppData(): Promise<AppData> {
  let provider: Provider = getProvider();
  let matchRows: string[][];
  let listRows: string[][];
  let imageRows: string[][] = [];
  let curatedRows: { oneVsOne: string[][]; twoVsTwo: string[][] } = { oneVsOne: [], twoVsTwo: [] };

  try {
    [matchRows, listRows, imageRows, curatedRows] = await Promise.all([
      readMatchesCached(),
      readListsCached(),
      readImagesCached(),
      readCuratedMatchesCached(),
    ]);
  } catch (error) {
    if (provider.kind !== 'api') throw error;

    // The API provider failed (bad credentials, revoked key, ...).
    // Fall back to the credential-free public CSV export so the dashboard
    // still renders instead of showing an error page.
    provider = publicProvider;
    [matchRows, listRows, imageRows, curatedRows] = await Promise.all([
      publicProvider.readMatches(),
      publicProvider.readLists(),
      publicProvider.readImages(),
      publicProvider.readCuratedMatches(),
    ]);
  }

  const { matches, rejected } = parseMatchesSheet(matchRows);
  const images = indexImages(imageRows);

  // The curated per-mode sheets are an independent copy of the same history.
  // They are parsed only to cross-check the aggregation — never used as rows.
  const curated = {
    oneVsOne: parseCurated1v1(curatedRows.oneVsOne),
    twoVsTwo: parseCurated2v2(curatedRows.twoVsTwo),
  };

  return buildAppData(
    matches,
    listRows,
    images,
    {
      source: provider.kind,
      spreadsheetId: spreadsheetId(),
      fetchedAt: new Date().toISOString(),
      imageRows: imageRows.length,
    },
    rejected,
    curated,
  );
}

export function currentSource(): ReturnType<typeof selectedSource> {
  return selectedSource();
}
