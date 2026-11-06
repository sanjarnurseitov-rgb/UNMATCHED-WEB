/**
 * Application data loader.
 *
 * Resolves the best available provider, loads the raw sheets, normalizes them
 * into matches + reference lists, and computes the dashboard statistics.
 */
import { parseMatchesSheet } from './parse';
import { buildAppData } from './stats';
import { identityKey } from './normalize';
import {
  getProvider,
  publicProvider,
  readImagesCached,
  readListsCached,
  readMatchesCached,
  selectedSource,
  spreadsheetId,
  type Provider,
} from './sheets';
import type { AppData } from './types';

export interface ImageIndex {
  players: Record<string, string>;
  heroes: Record<string, string>;
}

/** Convert the `Images` tab (name | type | url) into lookup maps. */
export function indexImages(rows: string[][]): ImageIndex {
  const index: ImageIndex = { players: {}, heroes: {} };
  for (const row of rows) {
    const name = (row[0] ?? '').trim();
    const type = (row[1] ?? '').trim().toLowerCase();
    const url = (row[2] ?? '').trim();
    if (!name || !url) continue;
    if (type === 'player') index.players[identityKey(name)] = url;
    else if (type === 'hero') index.heroes[identityKey(name)] = url;
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

  try {
    [matchRows, listRows, imageRows] = await Promise.all([
      readMatchesCached(),
      readListsCached(),
      readImagesCached(),
    ]);
  } catch (error) {
    if (provider.kind !== 'api') throw error;

    // The API provider failed (bad credentials, revoked key, ...).
    // Fall back to the credential-free public CSV export so the dashboard
    // still renders instead of showing an error page.
    provider = publicProvider;
    [matchRows, listRows, imageRows] = await Promise.all([
      publicProvider.readMatches(),
      publicProvider.readLists(),
      publicProvider.readImages(),
    ]);
  }

  const { matches, rejected } = parseMatchesSheet(matchRows);
  const images = indexImages(imageRows);

  return buildAppData(
    matches,
    listRows,
    images,
    {
      source: provider.kind,
      canWrite: provider.canWrite,
      spreadsheetId: spreadsheetId(),
      fetchedAt: new Date().toISOString(),
    },
    rejected,
  );
}

export function currentSource(): ReturnType<typeof selectedSource> {
  return selectedSource();
}
