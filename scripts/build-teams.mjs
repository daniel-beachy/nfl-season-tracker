// Regenerates data/teams.json from ESPN team metadata + static conf/division map.
import { fetchTeams } from './lib/espn.mjs';
import { TEAMS_PATH, writeJson } from './lib/store.mjs';
import { DIVISION_ORDER, DIVISIONS } from './lib/teams-map.mjs';

async function main() {
  const teams = await fetchTeams();
  teams.sort((a, b) => a.abbr.localeCompare(b.abbr));
  const byAbbr = Object.fromEntries(teams.map((t) => [t.abbr, t]));
  writeJson(TEAMS_PATH, {
    generatedAt: new Date().toISOString(),
    divisionOrder: DIVISION_ORDER,
    divisions: DIVISIONS,
    teams: byAbbr,
  });
  console.log(`Wrote ${teams.length} teams to data/teams.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
