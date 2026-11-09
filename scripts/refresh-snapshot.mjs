#!/usr/bin/env node
/**
 * Regenerate src/lib/snapshot.json from the live Google Sheet.
 *
 * The snapshot powers the offline / demo mode. It must contain the header row
 * (otherwise the first match is silently dropped) and the IMAGES tab — the
 * latter now has six columns, because the map block grew its own URL column.
 */
import { writeFileSync } from 'node:fs';

const SPREADSHEET_ID = process.env.SHEET_ID ?? '15IJy050me3WkkI2vYf10tMhCFCKF0dglRY_HaBF96vQ';
const BASE = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;

async function fetchTab(sheet, range) {
  const url = `${BASE}&sheet=${encodeURIComponent(sheet)}&range=${encodeURIComponent(range)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${sheet}: HTTP ${res.status}`);
  const text = await res.text();
  return parseCsv(text);
}

/** Minimal RFC-4180 CSV parser (handles quoted fields and embedded newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const matches = await fetchTab('Ответы на форму (3)', 'A1:V1200');
const lists = await fetchTab('PlayerList', 'A1:L400');
const images = await fetchTab('IMAGES', 'A1:Z400');
const curated = {
  oneVsOne: await fetchTab('Матчи 1 на 1', 'A1:Z1200'),
  twoVsTwo: await fetchTab('Матчи 2 на 2', 'A1:Z1200'),
};

const snapshot = { matches, lists, images, curated };
writeFileSync(
  new URL('../src/lib/snapshot.json', import.meta.url),
  `${JSON.stringify(snapshot)}\n`,
);

console.log('snapshot written:');
console.log('  matches:', matches.length, 'rows,', Math.max(...matches.map((r) => r.length)), 'cols');
console.log('  lists  :', lists.length, 'rows');
console.log('  images :', images.length, 'rows,', Math.max(...images.map((r) => r.length)), 'cols');
console.log('  header :', JSON.stringify(matches[0].slice(0, 8)));
console.log('  img hdr:', JSON.stringify(images[0]));
console.log('  curated:', curated.oneVsOne.length, 'rows 1v1 |', curated.twoVsTwo.length, 'rows 2v2');
