/**
 * Google Sheets integration layer.
 *
 * Three providers are supported, selected automatically:
 *
 *   api      — googleapis + a service account. Read & write. (needs creds)
 *   public   — the public CSV export endpoint. Read-only, no credentials.
 *   snapshot — a JSON snapshot bundled with the app. Offline fallback.
 *
 * The public/snapshot modes exist so the app is usable the moment it is
 * cloned: the user's sheet is shared "anyone with the link", so the dashboard
 * works immediately, and adding a service account only unlocks *writing*.
 */
import { google, type sheets_v4 } from 'googleapis';
import { parseCsv } from './csv';

export const DEFAULT_SPREADSHEET_ID = '15IJy050me3WkkI2vYf10tMhCFCKF0dglRY_HaBF96vQ';
export const DEFAULT_MATCHES_GID = '760832699';
export const DEFAULT_LISTS_GID = '1236097987';
export const DEFAULT_IMAGES_TAB = 'Images';

/** Tab titles in the live sheet. */
export const MATCHES_TAB_TITLE = 'Ответы на форму (3)';
export const LISTS_TAB_TITLE = 'PlayerList';

export type SourceKind = 'api' | 'public' | 'snapshot';

export interface SheetRow {
  row: string[];
}

export interface Provider {
  kind: SourceKind;
  canWrite: boolean;
  readMatches(): Promise<string[][]>;
  readLists(): Promise<string[][]>;
  readImages(): Promise<string[][]>;
  appendMatch(row: string[]): Promise<void>;
  appendListValue(tab: 'players' | 'heroes' | 'fanHeroes' | 'maps2v2' | 'maps1v1', value: string): Promise<void>;
  upsertImage(name: string, type: 'player' | 'hero', url: string): Promise<void>;
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

/** Resolve tab title -> sheetId using the spreadsheet metadata. */
async function sheetIdByTitle(title: string): Promise<number> {
  const client = getSheetsClient();
  const res = await client.spreadsheets.get({
    spreadsheetId: spreadsheetId(),
    fields: 'sheets.properties',
  });
  const sheet = res.data.sheets?.find((s) => s.properties?.title === title);
  if (!sheet?.properties?.sheetId) throw new Error(`Tab "${title}" not found in the spreadsheet.`);
  return sheet.properties.sheetId;
}

/** Create a tab if it does not exist yet. */
async function ensureTab(title: string): Promise<void> {
  const client = getSheetsClient();
  const res = await client.spreadsheets.get({
    spreadsheetId: spreadsheetId(),
    fields: 'sheets.properties',
  });
  const exists = res.data.sheets?.some((s) => s.properties?.title === title);
  if (exists) return;

  await client.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });
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
    throw new Error(`Google Sheets CSV export failed (HTTP ${res.status}). Is the sheet shared with "anyone with the link"?`);
  }
  return parseCsv(await res.text());
}

export const publicProvider: Provider = {
  kind: 'public',
  canWrite: false,
  readMatches: () => fetchPublicCsv(matchesGid()),
  readLists: () => fetchPublicCsv(listsGid()),
  readImages: async () => {
    // The Images tab does not exist yet -> no images.
    return [];
  },
  appendMatch: async () => {
    throw new Error(
      'Запись недоступна: не настроена учётная запись сервиса. Добавьте GOOGLE_SERVICE_ACCOUNT_JSON в .env.local.',
    );
  },
  appendListValue: async () => {
    throw new Error(
      'Запись недоступна: не настроена учётная запись сервиса. Добавьте GOOGLE_SERVICE_ACCOUNT_JSON в .env.local.',
    );
  },
  upsertImage: async () => {
    throw new Error(
      'Запись недоступна: не настроена учётная запись сервиса. Добавьте GOOGLE_SERVICE_ACCOUNT_JSON в .env.local.',
    );
  },
};

// ---------------------------------------------------------------------------
// Provider: Google Sheets API (read & write)
// ---------------------------------------------------------------------------

/**
 * Column layout of the `PlayerList` tab:
 *   C — СПИСОК ИГРОКОВ        (players)
 *   D — герои для анкеты     (heroes)
 *   F — фан персы игранные   (homebrew heroes)
 *   I — Поля 2 на 2          (2v2 maps)
 *   J — Поля 1 на 1          (1v1 maps)
 */
const LIST_COLUMNS = {
  players: 'C',
  heroes: 'D',
  fanHeroes: 'F',
  maps2v2: 'I',
  maps1v1: 'J',
} as const;

export const apiProvider: Provider = {
  kind: 'api',
  canWrite: true,

  async readMatches() {
    return readRange(`'${MATCHES_TAB_TITLE}'!A1:V`);
  },

  async readLists() {
    return readRange(`'${LISTS_TAB_TITLE}'!A1:N`);
  },

  async readImages() {
    try {
      await ensureTab(imagesTab());
      return await readRange(`'${imagesTab()}'!A1:C`);
    } catch {
      return [];
    }
  },

  async appendMatch(row) {
    const client = getSheetsClient();
    await client.spreadsheets.values.append({
      spreadsheetId: spreadsheetId(),
      range: `'${MATCHES_TAB_TITLE}'!A:V`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
  },

  async appendListValue(tab, value) {
    const client = getSheetsClient();
    const column = LIST_COLUMNS[tab];
    const range = `'${LISTS_TAB_TITLE}'!${column}:${column}`;
    await client.spreadsheets.values.append({
      spreadsheetId: spreadsheetId(),
      range,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[value]] },
    });
  },

  async upsertImage(name, type, url) {
    const client = getSheetsClient();
    await ensureTab(imagesTab());
    const rows = await readRange(`'${imagesTab()}'!A1:C`);

    const targetIndex = rows.findIndex(
      (r) => (r[0] ?? '').trim() === name && (r[1] ?? '').trim() === type,
    );

    if (targetIndex >= 0) {
      const rowNumber = targetIndex + 1;
      await client.spreadsheets.values.update({
        spreadsheetId: spreadsheetId(),
        range: `'${imagesTab()}'!C${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[url]] },
      });
      return;
    }

    await client.spreadsheets.values.append({
      spreadsheetId: spreadsheetId(),
      range: `'${imagesTab()}'!A:C`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[name, type, url]] },
    });
  },
};

// ---------------------------------------------------------------------------
// Provider: bundled snapshot (offline fallback)
// ---------------------------------------------------------------------------

interface Snapshot {
  matches: string[][];
  lists: string[][];
}

async function loadSnapshot(): Promise<Snapshot> {
  const mod = await import('./snapshot.json');
  return mod.default as unknown as Snapshot;
}

export const snapshotProvider: Provider = {
  kind: 'snapshot',
  canWrite: false,
  async readMatches() {
    return (await loadSnapshot()).matches;
  },
  async readLists() {
    return (await loadSnapshot()).lists;
  },
  async readImages() {
    return [];
  },
  async appendMatch() {
    throw new Error('Демо-режим: запись в таблицу отключена.');
  },
  async appendListValue() {
    throw new Error('Демо-режим: запись в таблицу отключена.');
  },
  async upsertImage() {
    throw new Error('Демо-режим: запись в таблицу отключена.');
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

export function clearCache(): void {
  cache.clear();
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
