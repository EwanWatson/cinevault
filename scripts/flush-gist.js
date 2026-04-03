#!/usr/bin/env node
// flush-gist.js — reads the CineVault sync Gist and stamps user-data columns
// (Favorite, Watchlist, Rating, RatingTimestamp, RankOverride) into the CSV files.
// Runs as a scheduled GitHub Action; also safe to run locally.
//
// Required environment variables:
//   GIST_PAT  — GitHub PAT with gist scope
//   GIST_ID   — The Gist ID (shown in the Data Management modal)
//
// Usage:
//   node scripts/flush-gist.js [--dry-run]

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Tiny CSV parser (no external deps needed for well-formed CSVs) ────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];
  const headers = splitCSVRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = splitCSVRow(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] !== undefined ? vals[idx] : ''; });
    rows.push(row);
  }
  return { headers, rows };
}

function splitCSVRow(line) {
  const fields = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { fields.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  fields.push(cur);
  return fields;
}

function csvEscape(val) {
  const s = (val != null ? String(val) : '').replace(/\r?\n/g, ' ');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function serializeCSV(headers, rows) {
  const headerLine = headers.join(',');
  const dataLines  = rows.map(row =>
    headers.map(h => csvEscape(row[h] != null ? String(row[h]) : '')).join(',')
  );
  return [headerLine, ...dataLines].join('\r\n') + '\r\n';
}

// ── App logic (mirrors index.html) ───────────────────────────────────────────
function filmKey(row) {
  return `${row.Title}|||${row.Year}`;
}

function yearToFileKey(year) {
  const y = parseInt(year, 10);
  if (isNaN(y) || y >= 1990) return String(year);
  const decade = Math.floor(y / 10) * 10;
  return `${decade}s`;
}

// ── GitHub API helpers ────────────────────────────────────────────────────────
async function gistFetch(pat, gistId) {
  const { default: fetch } = await import('node-fetch');
  const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `token ${pat}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cinevault-flush-gist',
    },
  });
  if (!resp.ok) throw new Error(`Gist fetch failed: ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  const file = data.files && data.files['cinevault_sync.json'];
  if (!file) throw new Error('cinevault_sync.json not found in Gist');
  return JSON.parse(file.content);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const pat    = process.env.GIST_PAT;
  const gistId = process.env.GIST_ID;

  if (!pat || !gistId) {
    console.error('ERROR: GIST_PAT and GIST_ID environment variables are required.');
    process.exit(1);
  }

  console.log(`CineVault flush-gist — ${dryRun ? 'DRY RUN ' : ''}starting…`);

  // 1. Read Gist
  let payload;
  try {
    payload = await gistFetch(pat, gistId);
  } catch (err) {
    console.error('ERROR reading Gist:', err.message);
    process.exit(1);
  }

  const favorites    = new Set(payload.favorites    || []);
  const watchlist    = new Set(payload.watchlist     || []);
  const watched      = payload.watched               || {};
  const rankOverrides = payload.rankOverrides        || {};

  console.log(`Gist snapshot: ${favorites.size} favorites, ${watchlist.size} watchlist, ${Object.keys(watched).length} rated, ${Object.keys(rankOverrides).length} rank overrides`);
  console.log(`Gist last updated: ${payload._updated || 'unknown'}`);

  // 2. Collect all affected film keys and group by CSV file key
  const allKeys = new Set([
    ...favorites,
    ...watchlist,
    ...Object.keys(watched),
    ...Object.keys(rankOverrides),
  ]);

  if (allKeys.size === 0) {
    console.log('Nothing to flush — Gist payload is empty.');
    process.exit(0);
  }

  const byFileKey = {};
  for (const key of allKeys) {
    const parts = key.split('|||');
    if (parts.length < 2) continue;
    const yr = parts[parts.length - 1];
    const fk = isNaN(parseInt(yr, 10)) ? yr : yearToFileKey(parseInt(yr, 10));
    if (!byFileKey[fk]) byFileKey[fk] = new Set();
    byFileKey[fk].add(key);
  }

  console.log(`Affected CSV files: ${Object.keys(byFileKey).sort().join(', ')}`);

  const DATA_DIR = path.join(__dirname, '..', 'data');
  const CSV_HEADERS = [
    'Rank','Title','Year','Director','Primary_Genre','Synopsis',
    'Major_Awards','Key_Sources','Favorite','Watchlist',
    'Rating','RatingTimestamp','RankOverride'
  ];

  let totalChanged = 0;
  let filesChanged = 0;

  // 3. For each affected CSV: read → stamp → write (if changed)
  for (const [fk, keys] of Object.entries(byFileKey)) {
    const csvPath = path.join(DATA_DIR, `films_${fk}.csv`);
    if (!fs.existsSync(csvPath)) {
      console.warn(`  SKIP  films_${fk}.csv — file not found`);
      continue;
    }

    const raw    = fs.readFileSync(csvPath, 'utf8');
    const parsed = parseCSV(raw);
    if (!parsed || !parsed.rows) { console.warn(`  SKIP  films_${fk}.csv — parse failed`); continue; }

    let rowsChanged = 0;
    const updatedRows = parsed.rows.map(row => {
      const key = filmKey(row);
      if (!keys.has(key)) return row;

      const wd   = watched[key];
      const newFav  = favorites.has(key)    ? '1' : '';
      const newWl   = watchlist.has(key)    ? '1' : '';
      const newRat  = wd ? String(wd.rating)    : '';
      const newTs   = wd ? wd.timestamp         : '';
      const newRank = rankOverrides[key] != null ? String(rankOverrides[key]) : '';

      // Only count as changed if something actually differs
      if (
        row.Favorite      === newFav  &&
        row.Watchlist     === newWl   &&
        row.Rating        === newRat  &&
        row.RatingTimestamp === newTs &&
        row.RankOverride  === newRank
      ) return row;

      rowsChanged++;
      return { ...row, Favorite: newFav, Watchlist: newWl, Rating: newRat, RatingTimestamp: newTs, RankOverride: newRank };
    });

    if (rowsChanged === 0) {
      console.log(`  OK    films_${fk}.csv — already up to date`);
      continue;
    }

    const newContent = serializeCSV(parsed.headers, updatedRows);
    if (!dryRun) {
      fs.writeFileSync(csvPath, newContent, 'utf8');
    }
    console.log(`  ${dryRun ? 'DRY ' : ''}WRITE films_${fk}.csv — ${rowsChanged} row${rowsChanged !== 1 ? 's' : ''} updated`);
    totalChanged += rowsChanged;
    filesChanged++;
  }

  console.log(`\nDone — ${totalChanged} row${totalChanged !== 1 ? 's' : ''} updated across ${filesChanged} file${filesChanged !== 1 ? 's' : ''}${dryRun ? ' (dry run — no files written)' : ''}.`);

  // Exit code 0 always — let the workflow decide whether to commit based on git status
  process.exit(0);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
