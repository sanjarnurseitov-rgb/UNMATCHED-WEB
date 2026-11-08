/**
 * Google Sheets integration layer — strictly read-only.
 *
 * Three providers are supported, selected automatically:
 *
 *   api      — googleapis + a service account. Read only. (needs creds)
 *   public   — the public CSV export endpoint. Read-only, no credentials.
 *   snapshot — a JSON snapshot bundled with the app. Offline fallback.
 *
 * The app is an analytical dashboard: it never writes back to the spreadsheet.
 * There is no append/upsert code path here by design.
 */
import { google, type sheets_v4 } from 'googleapis';
import { parseCsv } from './csv';

export const DEFAULT_SPREADSHEET_ID = '15IJy050me3WkkI2vYf10tMhCFCKF0dglRY_HaBF96vQ';
export const DEFAULT_MATCHES_GID = '760832699';
export const DEFAULT_LISTS_GID = '1236097987';

/**
 * Tab that stores image URLs.
 *
 * The sheet stores them in a tab named exactly `IMAGES` with the columns
 * Имя | Тип | URL, where Тип is one of `hero`, `player` or `Map`. The tab may
 * hold several such column blocks side by side (the live sheet has one block
 * for heroes/players and a second one for the battlefields), so the parser in
 * `src/lib/data.ts` detects the blocks from the header row.
 */
export const DEFAULT_IMAGES_TAB = 'IMAGES';

/** Tab titles in the live sheet. */
export const MATCHES_TAB_TITLE = 'Ответы на форму (3)';
export const LISTS_TAB_TITLE = 'PlayerList';

export type SourceKind = 'api' | 'public' | 'snapshot';

export interface Provider {
  kind: SourceKind;
  readMatches(): Promise<string[][]>;
  readLists(): Promise<string[][]>;
  readImages(): Promise<string[][]>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function spreadsheetId(): string {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
}

function matchesGid(): string {
  return process.env.SHEETS_TAB_MATCHES_GID || DEFAULT_MATCHES_GID;
}

function listsGid(): string {
  return process.env.SHEETS_TAB_LISTS_GID || DEFAULT_LISTS_GID;
}

function imagesTab(): string {
  return process.env.SHEETS_TAB_IMAGES || DEFAULT_IMAGES_TAB;
}

function imagesGid(): string | undefined {
  return process.env.SHEETS_TAB_IMAGES_GID?.trim() || undefined;
}

function hasCredentials(): boolean {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return true;
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

export function selectedSource(): SourceKind {
  const forced = (process.env.DATA_SOURCE || 'auto').toLowerCase();
  if (forced === 'api' || forced === 'public' || forced === 'snapshot') return forced;
  if (hasCredentials()) return 'api';
  return 'public';
}

// ---------------------------------------------------------------------------
// googleapis helpers
// ---------------------------------------------------------------------------

let sheetsClient: sheets_v4.Sheets | null = null;

function getSheetsClient(): sheets_v4.Sheets {
  if (sheetsClient) return sheetsClient;

  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const credentials = inline
    ? JSON.parse(inline)
    : {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      };

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google service account credentials are not configured.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

async function readRange(range: string): Promise<string[][]> {
  const client = getSheetsClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range,
  });
  return (res.data.values ?? []).map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
}

// ---------------------------------------------------------------------------
// Provider: public CSV export (read-only, no credentials)
// ---------------------------------------------------------------------------

async function fetchPublicCsv(gid: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId()}/export?format=csv&gid=${gid}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(
      `Google Sheets CSV export failed (HTTP ${res.status}). Is the sheet shared with "anyone with the link"?`,
    );
  }
  return parseCsv(await res.text());
}

/**
 * Read a tab **by name** through the gviz CSV endpoint.
 *
 * The plain `export?format=csv&gid=<n>` endpoint only works with a numeric
 * gid, and the gid of the IMAGES tab is not known to the app. gviz accepts a
 * tab name, which is exactly what is needed here.
 */
async function fetchPublicCsvByTabName(tab: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId()}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    tab,
  )}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Google Sheets CSV export for tab "${tab}" failed (HTTP ${res.status}).`);
  }
  const text = await res.text();
  // gviz answers with an HTML error page when the tab does not exist.
  if (/^\s*<(!DOCTYPE|html)/i.test(text)) {
    throw new Error(`Tab "${tab}" is not available in the public CSV export.`);
  }
  return parseCsv(text);
}

export const publicProvider: Provider = {
  kind: 'public',
  readMatches: () => fetchPublicCsv(matchesGid()),
  readLists: () => fetchPublicCsv(listsGid()),
  async readImages() {
    try {
      const gid = imagesGid();
      if (gid) return await fetchPublicCsv(gid);
      return await fetchPublicCsvByTabName(imagesTab());
    } catch {
      // A missing IMAGES tab must never break the dashboard.
      return [];
    }
  },
};

// ---------------------------------------------------------------------------
// Provider: Google Sheets API (read only)
// ---------------------------------------------------------------------------

/**
 * Column layout of the `PlayerList` tab:
 *   C — СПИСОК ИГРОКОВ        (players)
 *   D — герои для анкеты     (heroes)
 *   F — фан персы игранные   (homebrew heroes)
 *   I — Поля 2 на 2          (2v2 maps)
 *   J — Поля 1 vs 1          (1v1 maps)
 */
export const apiProvider: Provider = {
  kind: 'api',

  async readMatches() {
    return readRange(`'${MATCHES_TAB_TITLE}'!A1:V`);
  },

  async readLists() {
    return readRange(`'${LISTS_TAB_TITLE}'!A1:N`);
  },

  async readImages() {
    try {
      return await readRange(`'${imagesTab()}'!A1:Z`);
    } catch {
      return [];
    }
  },
};

// ---------------------------------------------------------------------------
// Provider: bundled snapshot (offline fallback)
// ---------------------------------------------------------------------------

interface Snapshot {
  matches: string[][];
  lists: string[][];
  images?: string[][];
}

async function loadSnapshot(): Promise<Snapshot> {
  const mod = await import('./snapshot.json');
  return mod.default as unknown as Snapshot;
}

export const snapshotProvider: Provider = {
  kind: 'snapshot',
  async readMatches() {
    return (await loadSnapshot()).matches;
  },
  async readLists() {
    return (await loadSnapshot()).lists;
  },
  async readImages() {
    return (await loadSnapshot()).images ?? [];
  },
};

// ---------------------------------------------------------------------------
// Provider selection + caching
// ---------------------------------------------------------------------------

export function getProvider(): Provider {
  switch (selectedSource()) {
    case 'api':
      return apiProvider;
    case 'snapshot':
      return snapshotProvider;
    default:
      return publicProvider;
  }
}

interface CacheEntry<T> {
  value: T;
  expires: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const TTL_MS = 20_000;

async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await loader();
  cache.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

export function readMatchesCached(): Promise<string[][]> {
  return cached('matches', () => getProvider().readMatches());
}

export function readListsCached(): Promise<string[][]> {
  return cached('lists', () => getProvider().readLists());
}

export function readImagesCached(): Promise<string[][]> {
  return cached('images', () => getProvider().readImages());
}
