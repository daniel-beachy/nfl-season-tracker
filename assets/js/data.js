// Data loading + time-series transforms. All fetches are relative to index.html.

const cache = { index: null, teams: null, seasons: {} };

async function getJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
  return res.json();
}

export async function loadIndex() {
  if (!cache.index) cache.index = await getJson('data/index.json');
  return cache.index;
}

export async function loadTeams() {
  if (!cache.teams) cache.teams = await getJson('data/teams.json');
  return cache.teams;
}

export async function loadSeason(year) {
  if (!cache.seasons[year]) cache.seasons[year] = await getJson(`data/seasons/${year}.json`);
  return cache.seasons[year];
}

export function sortedSnapshots(season) {
  return [...(season.snapshots || [])].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );
}

// Build a per-team projection time series for one field.
// abbrs: which teams to include. normalizeGroups: if true, each snapshot's values are
// scaled so the included teams sum to 100 (used for Win Division).
export function projectionSeries(season, field, abbrs, { normalize = false } = {}) {
  const snaps = sortedSnapshots(season);
  const labels = snaps.map((s) => s.label);
  const datasets = abbrs.map((abbr) => {
    const data = snaps.map((s) => {
      const v = s.projections?.[abbr]?.[field];
      return v === undefined ? null : v;
    });
    return { abbr, data };
  });
  if (normalize) {
    snaps.forEach((s, i) => {
      const sum = datasets.reduce((acc, d) => acc + (d.data[i] || 0), 0);
      if (sum > 0) datasets.forEach((d) => {
        if (d.data[i] !== null) d.data[i] = Math.round((d.data[i] / sum) * 1000) / 10;
      });
    });
  }
  return { labels, datasets };
}

// Snapshots that actually contain leaders for a category, chronologically.
function leaderSnapshots(season, category) {
  return sortedSnapshots(season).filter(
    (s) => s.leaders && Array.isArray(s.leaders[category]) && s.leaders[category].length
  );
}

// Time series for a leader category: one line per athlete in the latest top-10,
// traced backward through earlier snapshots.
export function leaderSeries(season, category) {
  const snaps = leaderSnapshots(season, category);
  if (!snaps.length) return { labels: [], datasets: [], latest: [] };
  const labels = snaps.map((s) => s.label);
  const latest = snaps[snaps.length - 1].leaders[category];
  const datasets = latest.map((athlete) => {
    const data = snaps.map((s) => {
      const row = s.leaders[category].find((r) => r.athleteId === athlete.athleteId);
      return row ? row.value : null;
    });
    return { athlete, data };
  });
  return { labels, datasets, latest };
}

export function currentLeaders(season, category) {
  const snaps = leaderSnapshots(season, category);
  return snaps.length ? snaps[snaps.length - 1].leaders[category] : [];
}

export function latestSnapshot(season) {
  const snaps = sortedSnapshots(season);
  return snaps.length ? snaps[snaps.length - 1] : null;
}
