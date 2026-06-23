// Shared JSON store helpers for season files + index.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const SEASON_DIR = path.join(DATA_DIR, 'seasons');
export const INDEX_PATH = path.join(DATA_DIR, 'index.json');
export const TEAMS_PATH = path.join(DATA_DIR, 'teams.json');
export const ATHLETE_CACHE_PATH = path.join(DATA_DIR, 'athlete-cache.json');

export function ensureDirs() {
  fs.mkdirSync(SEASON_DIR, { recursive: true });
}

export function readJson(p, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

export function seasonPath(year) {
  return path.join(SEASON_DIR, `${year}.json`);
}

export function loadSeason(year) {
  return readJson(seasonPath(year), null);
}

export function saveSeason(year, data) {
  data.snapshots.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  writeJson(seasonPath(year), data);
}

// Insert or replace a snapshot by its key (idempotent).
export function upsertSnapshot(seasonData, snapshot) {
  const i = seasonData.snapshots.findIndex((s) => s.key === snapshot.key);
  if (i >= 0) seasonData.snapshots[i] = snapshot;
  else seasonData.snapshots.push(snapshot);
  return seasonData;
}

// Rebuild data/index.json from the season files present on disk.
export function rebuildIndex() {
  ensureDirs();
  const files = fs.existsSync(SEASON_DIR)
    ? fs.readdirSync(SEASON_DIR).filter((f) => /^\d{4}\.json$/.test(f))
    : [];
  const seasons = files
    .map((f) => readJson(path.join(SEASON_DIR, f)))
    .filter(Boolean)
    .map((s) => ({
      season: s.season,
      label: s.label || String(s.season),
      mocked: !!s.mocked,
      started: !!s.started,
      seasonStart: s.seasonStart || null,
      snapshotCount: (s.snapshots || []).length,
      lastUpdated: s.lastUpdated || null,
    }))
    .sort((a, b) => b.season - a.season);

  const index = {
    generatedAt: new Date().toISOString(),
    defaultSeason: seasons.length ? seasons[0].season : null,
    seasons,
  };
  writeJson(INDEX_PATH, index);
  return index;
}
