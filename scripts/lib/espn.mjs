// ESPN keyless endpoint client. No API keys required.
// Pure Node (built-in fetch, Node 18+). No external dependencies.

import { TEAM_GROUPS } from './teams-map.mjs';

const UA = 'Mozilla/5.0 (compatible; nfl-season-tracker/1.0; +https://github.com)';

const ENDPOINTS = {
  powerindex: 'https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex',
  teams: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams',
  leaders: (year) =>
    `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/types/2/leaders`,
};

// Leader categories we capture (subset of the 16 ESPN exposes), with friendly labels.
export const LEADER_CATEGORIES = [
  { key: 'passingYards', label: 'Passing Yards', unit: 'YDS', group: 'Passing' },
  { key: 'passingTouchdowns', label: 'Passing TDs', unit: 'TD', group: 'Passing' },
  { key: 'rushingYards', label: 'Rushing Yards', unit: 'YDS', group: 'Rushing' },
  { key: 'rushingTouchdowns', label: 'Rushing TDs', unit: 'TD', group: 'Rushing' },
  { key: 'receivingYards', label: 'Receiving Yards', unit: 'YDS', group: 'Receiving' },
  { key: 'receivingTouchdowns', label: 'Receiving TDs', unit: 'TD', group: 'Receiving' },
  { key: 'receptions', label: 'Receptions', unit: 'REC', group: 'Receiving' },
  { key: 'totalTouchdowns', label: 'Total TDs', unit: 'TD', group: 'Scoring' },
  { key: 'sacks', label: 'Sacks', unit: 'SACK', group: 'Defense' },
  { key: 'interceptions', label: 'Interceptions', unit: 'INT', group: 'Defense' },
  { key: 'totalTackles', label: 'Total Tackles', unit: 'TOT', group: 'Defense' },
  { key: 'quarterbackRating', label: 'QB Rating', unit: 'RAT', group: 'Passing' },
];

export async function httpJson(url, { retries = 3, timeoutMs = 30000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// Returns array of normalized team metadata merged with conf/division.
export async function fetchTeams() {
  const j = await httpJson(ENDPOINTS.teams);
  const raw = j.sports[0].leagues[0].teams.map((x) => x.team);
  return raw.map((t) => {
    const grp = TEAM_GROUPS[t.abbreviation] || {};
    return {
      id: String(t.id),
      abbr: t.abbreviation,
      name: t.displayName,
      shortName: t.shortDisplayName,
      location: t.location,
      nickname: t.name,
      color: '#' + (t.color || '000000'),
      altColor: '#' + (t.alternateColor || 'ffffff'),
      conference: grp.conference || null,
      division: grp.division || null,
      logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${t.abbreviation.toLowerCase()}.png`,
    };
  });
}

// Parses power index into { season, lastUpdated, teams: { ABBR: {projection fields} } }.
export async function fetchPowerIndex(season) {
  const url = season ? `${ENDPOINTS.powerindex}?season=${season}` : ENDPOINTS.powerindex;
  const j = await httpJson(url);
  const projMeta = (j.categories || []).find((c) => c.name === 'projections');
  const names = projMeta ? projMeta.names : [];
  const out = {};
  for (const entry of j.teams || []) {
    const abbr = entry.team.abbreviation;
    const cat = (entry.categories || []).find((c) => c.name === 'projections');
    if (!cat) continue;
    const vals = {};
    names.forEach((n, i) => {
      vals[n] = cat.values[i];
    });
    out[abbr] = {
      projectedw: num(vals.projectedw),
      projectedl: num(vals.projectedl),
      probwindiv: num(vals.probwindiv),
      probmakeplayoffs: num(vals.probmakeplayoffs),
      probmaketitlegame: num(vals.probmaketitlegame),
      probwintitle: num(vals.probwintitle),
      probmakeconfchamp: num(vals.probmakeconfchamp),
    };
  }
  return {
    season: j.requestedSeason?.year ?? j.currentSeason?.year ?? season ?? null,
    seasonMeta: j.currentSeason ?? null,
    lastUpdated: j.lastUpdated ?? null,
    teams: out,
  };
}

function num(v) {
  return v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v);
}

function idFromRef(ref) {
  const m = /\/(\d+)(?:\?|$)/.exec(ref || '');
  return m ? m[1] : null;
}

// Resolve athlete names with a persistent id->meta cache to minimize HTTP calls.
export async function resolveAthletes(ids, cache, year) {
  const missing = ids.filter((id) => !cache[id]);
  for (const id of missing) {
    try {
      const a = await httpJson(
        `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/athletes/${id}?lang=en&region=us`
      );
      cache[id] = {
        name: a.fullName || a.displayName || `#${id}`,
        shortName: a.shortName || a.displayName || `#${id}`,
        pos: a.position?.abbreviation || '',
      };
    } catch {
      cache[id] = { name: `#${id}`, shortName: `#${id}`, pos: '' };
    }
  }
  return cache;
}

// Returns { category: [ {athleteId, name, shortName, pos, teamId, teamAbbr, value} x topN ] }.
export async function fetchLeaders(year, teamIdToAbbr, athleteCache, topN = 10) {
  const j = await httpJson(ENDPOINTS.leaders(year));
  const cats = j.categories || [];
  const wanted = new Set(LEADER_CATEGORIES.map((c) => c.key));
  const idsToResolve = new Set();
  const prelim = {};
  for (const c of cats) {
    if (!wanted.has(c.name)) continue;
    const top = (c.leaders || []).slice(0, topN).map((L) => {
      const athleteId = idFromRef(L.athlete?.$ref);
      const teamId = idFromRef(L.team?.$ref);
      if (athleteId) idsToResolve.add(athleteId);
      return { athleteId, teamId, value: Number(L.value), displayValue: L.displayValue };
    });
    if (top.length) prelim[c.name] = top;
  }
  await resolveAthletes([...idsToResolve], athleteCache, year);
  const out = {};
  for (const [cat, rows] of Object.entries(prelim)) {
    out[cat] = rows.map((r) => {
      const meta = athleteCache[r.athleteId] || {};
      return {
        athleteId: r.athleteId,
        name: meta.name || `#${r.athleteId}`,
        shortName: meta.shortName || meta.name || `#${r.athleteId}`,
        pos: meta.pos || '',
        teamId: r.teamId,
        teamAbbr: teamIdToAbbr[r.teamId] || null,
        value: r.value,
        displayValue: r.displayValue,
      };
    });
  }
  return out;
}
