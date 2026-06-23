// Main data-capture entrypoint. Run by GitHub Actions (Wednesday cron) or manually.
//   node scripts/capture.mjs                  # capture current season "now"
//   node scripts/capture.mjs --date 2026-09-10  # simulate a capture date (testing)
import {
  fetchPowerIndex,
  fetchLeaders,
  fetchTeams,
} from './lib/espn.mjs';
import { computeSnapshot } from './lib/phase.mjs';
import {
  loadSeason,
  saveSeason,
  upsertSnapshot,
  rebuildIndex,
  ensureDirs,
  writeJson,
  readJson,
  TEAMS_PATH,
  ATHLETE_CACHE_PATH,
} from './lib/store.mjs';
import { DIVISION_ORDER, DIVISIONS } from './lib/teams-map.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  ensureDirs();
  const now = arg('date') ? new Date(arg('date') + 'T16:00:00Z') : new Date();

  console.log(`Capture run at ${now.toISOString()}`);

  // 1. Projections + season calendar.
  const pi = await fetchPowerIndex(arg('season'));
  const { season, phase, started, snapshot } = computeSnapshot(now, pi.seasonMeta);
  console.log(`Season ${season} | phase=${phase} | started=${started} | key=${snapshot.key} (${snapshot.label})`);

  // 2. Team metadata + colors (refresh each run).
  const teams = await fetchTeams();
  teams.sort((a, b) => a.abbr.localeCompare(b.abbr));
  const byAbbr = Object.fromEntries(teams.map((t) => [t.abbr, t]));
  const teamIdToAbbr = Object.fromEntries(teams.map((t) => [t.id, t.abbr]));
  writeJson(TEAMS_PATH, {
    generatedAt: new Date().toISOString(),
    divisionOrder: DIVISION_ORDER,
    divisions: DIVISIONS,
    teams: byAbbr,
  });

  // 3. Leaders (only meaningful once games are played).
  let leaders = {};
  if (started) {
    const athleteCache = readJson(ATHLETE_CACHE_PATH, {});
    try {
      leaders = await fetchLeaders(season, teamIdToAbbr, athleteCache, 10);
      writeJson(ATHLETE_CACHE_PATH, athleteCache);
    } catch (e) {
      console.warn('Leaders fetch failed (continuing without):', e.message);
    }
  } else {
    console.log('Season not started — skipping leaders capture.');
  }

  // 4. Assemble snapshot.
  const record = {
    ...snapshot,
    capturedAt: now.toISOString(),
    projectionsSource: pi.lastUpdated,
    projections: pi.teams,
    leaders,
  };

  // 5. Load/create season file and upsert.
  const existing = loadSeason(season);
  const seasonStart = pi.seasonMeta?.type?.startDate
    ? pi.seasonMeta.type.startDate.slice(0, 10)
    : existing?.seasonStart ?? null;

  const seasonData = existing || {
    season,
    label: String(season),
    mocked: false,
    started,
    seasonStart,
    snapshots: [],
  };
  // Preserve mocked labelling; only manage live-season metadata here.
  if (!seasonData.mocked) {
    seasonData.label = String(season);
    seasonData.mocked = false;
  }
  seasonData.started = started || seasonData.started;
  seasonData.seasonStart = seasonStart;
  seasonData.lastUpdated = now.toISOString();
  seasonData.phase = phase;

  upsertSnapshot(seasonData, record);
  saveSeason(season, seasonData);
  rebuildIndex();

  console.log(`Saved snapshot ${snapshot.key}; season now has ${seasonData.snapshots.length} snapshot(s).`);
}

main().catch((e) => {
  console.error('Capture failed:', e);
  process.exit(1);
});
