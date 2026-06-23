// Generates plausible MOCKED 2025 weekly data (clearly labeled "mocked — not fully accurate").
// Projections evolve from strength-based preseason priors toward simulated outcomes, sharpening
// over the season and into the playoffs. Stat leaders use REAL 2025 final names/totals (fetched
// from ESPN) with synthesized week-over-week cumulative curves.
import {
  fetchLeaders,
  fetchTeams,
  LEADER_CATEGORIES,
} from './lib/espn.mjs';
import {
  loadSeason,
  saveSeason,
  rebuildIndex,
  ensureDirs,
  readJson,
  writeJson,
  ATHLETE_CACHE_PATH,
} from './lib/store.mjs';
import { DIVISIONS, DIVISION_ORDER } from './lib/teams-map.mjs';

const SEASON = 2025;
const REG_WEEKS = 18;

// Deterministic RNG so regeneration is reproducible.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20251);
const noise = (amp) => (rand() * 2 - 1) * amp;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Plausible 2025 latent strengths (purely illustrative; data is mocked).
const STRENGTH = {
  BUF: 8.5, MIA: 6.0, NYJ: 5.0, NE: 5.3,
  BAL: 8.8, PIT: 6.7, CIN: 6.9, CLE: 4.2,
  HOU: 7.1, IND: 6.2, JAX: 5.2, TEN: 4.2,
  KC: 8.6, LAC: 6.9, DEN: 7.0, LV: 4.9,
  PHI: 8.4, DAL: 6.4, WSH: 6.6, NYG: 4.6,
  DET: 8.2, GB: 7.7, MIN: 6.5, CHI: 6.0,
  TB: 6.9, ATL: 6.1, NO: 4.6, CAR: 5.0,
  SF: 7.9, LAR: 7.8, SEA: 7.0, ARI: 5.6,
};

function conferenceTeams(conf) {
  return Object.entries(DIVISIONS)
    .filter(([d]) => d.startsWith(conf))
    .flatMap(([, t]) => t);
}

// --- Simulate season outcomes for realistic convergence targets ---
function simulateOutcomes() {
  const divWinners = {};
  for (const [div, teams] of Object.entries(DIVISIONS)) {
    divWinners[div] = [...teams].sort(
      (a, b) => STRENGTH[b] + noise(0.6) - STRENGTH[a]
    )[0];
  }

  const playoffTeams = {};
  const seeds = {};
  for (const conf of ['AFC', 'NFC']) {
    const divs = DIVISION_ORDER.filter((d) => d.startsWith(conf));
    const winners = divs.map((d) => divWinners[d]).sort((a, b) => STRENGTH[b] - STRENGTH[a]);
    const rest = conferenceTeams(conf)
      .filter((t) => !winners.includes(t))
      .sort((a, b) => STRENGTH[b] + noise(0.5) - STRENGTH[a]);
    const wildcards = rest.slice(0, 3);
    const ordered = [...winners, ...wildcards.sort((a, b) => STRENGTH[b] - STRENGTH[a])];
    playoffTeams[conf] = ordered;
    ordered.forEach((t, i) => (seeds[t] = i + 1));
  }

  // Bracket sim: higher strength advances, with upset chance scaling on strength gap.
  const advance = (a, b) => {
    const pa = STRENGTH[a] / (STRENGTH[a] + STRENGTH[b]);
    return rand() < pa ? a : b;
  };
  const confChamp = {};
  for (const conf of ['AFC', 'NFC']) {
    const p = playoffTeams[conf]; // seeds 1..7 (index 0..6)
    // Wild card: 2v7,3v6,4v5 ; #1 bye
    const w1 = advance(p[1], p[6]);
    const w2 = advance(p[2], p[5]);
    const w3 = advance(p[3], p[4]);
    // Divisional: #1 vs lowest remaining seed; other two play
    const remaining = [p[0], w1, w2, w3].sort((a, b) => seeds[a] - seeds[b]);
    const d1 = advance(remaining[0], remaining[3]);
    const d2 = advance(remaining[1], remaining[2]);
    confChamp[conf] = advance(d1, d2);
  }
  const sbTeams = [confChamp.AFC, confChamp.NFC];
  const champion = advance(sbTeams[0], sbTeams[1]);

  // Final wins per team from strength, normalized so the league sums to 272 (17 games * 32 / 2).
  const rawWins = {};
  let total = 0;
  for (const [t, s] of Object.entries(STRENGTH)) {
    const w = clamp(1.5 + (s - 4) * 2.0 + noise(1.5), 1, 16);
    rawWins[t] = w;
    total += w;
  }
  const scale = 272 / total;
  const finalWins = {};
  for (const t of Object.keys(STRENGTH)) finalWins[t] = clamp(rawWins[t] * scale, 0, 17);

  return { divWinners, playoffTeams, confChamp, sbTeams, champion, finalWins, seeds };
}

const OUT = simulateOutcomes();

// Convergence factor: regular season eases 0.05 -> ~0.62, playoffs sharpen toward 1.
function sharpen(idx, isPlayoff, roundFrac) {
  if (!isPlayoff) {
    const t = idx / (REG_WEEKS - 1);
    return 0.05 + 0.6 * Math.pow(t, 1.25);
  }
  return [0.8, 0.9, 0.97, 1.0][roundFrac] ?? 1.0;
}

function priorStrengthZ(teams) {
  const ss = teams.map((t) => STRENGTH[t]);
  const mean = ss.reduce((a, b) => a + b, 0) / ss.length;
  const sd = Math.sqrt(ss.reduce((a, b) => a + (b - mean) ** 2, 0) / ss.length) || 1;
  const z = {};
  teams.forEach((t) => (z[t] = (STRENGTH[t] - mean) / sd));
  return z;
}

function buildProjections(idx, isPlayoff, roundIdx) {
  const k = sharpen(idx, isPlayoff, roundIdx);
  const proj = {};
  for (const t of Object.keys(STRENGTH)) proj[t] = {};

  // Projected wins: blend prior expected wins -> final wins.
  for (const t of Object.keys(STRENGTH)) {
    const prior = clamp(4 + (STRENGTH[t] - 6) * 1.6, 2, 14);
    const tt = isPlayoff ? 1 : idx / (REG_WEEKS - 1);
    const pw = clamp(prior * (1 - tt) + OUT.finalWins[t] * tt + noise(0.4 * (1 - tt)), 0, 17);
    proj[t].projectedw = round1(pw);
    proj[t].projectedl = round1(17 - pw);
  }

  // Win division: softmax within each division, sharpening toward the winner.
  for (const [div, teams] of Object.entries(DIVISIONS)) {
    const z = priorStrengthZ(teams);
    const beta = 0.8 + 2.6 * k;
    const raw = {};
    let sum = 0;
    for (const t of teams) {
      const target = OUT.divWinners[div] === t ? 1 : 0;
      const base = Math.exp(beta * z[t]);
      const v = base * (1 - k) + target * k * 6 + 0.02;
      raw[t] = Math.max(v + noise(0.05), 0.001);
      sum += raw[t];
    }
    for (const t of teams) proj[t].probwindiv = round1((raw[t] / sum) * 100);
  }

  // Make playoffs: per conference, ~7 teams, sharpening toward the playoff field.
  for (const conf of ['AFC', 'NFC']) {
    const teams = conferenceTeams(conf);
    const z = priorStrengthZ(teams);
    const raw = {};
    for (const t of teams) {
      const made = OUT.playoffTeams[conf].includes(t) ? 1 : 0;
      const prior = sigmoid((z[t] - 0.15) * (1.6 + 1.5 * k));
      raw[t] = clamp(prior * (1 - k) + made * k + noise(0.04 * (1 - k)), 0.002, 0.999);
    }
    // Scale conference to ~700% (7 playoff teams) then clamp.
    const sum = Object.values(raw).reduce((a, b) => a + b, 0);
    const scale = 7 / sum;
    for (const t of teams) proj[t].probmakeplayoffs = round1(clamp(raw[t] * scale, 0, 1) * 100);
  }

  // Make Super Bowl (probmaketitlegame): per conference sums ~100, gated by playoff odds.
  for (const conf of ['AFC', 'NFC']) {
    const teams = conferenceTeams(conf);
    const z = priorStrengthZ(teams);
    const raw = {};
    let sum = 0;
    for (const t of teams) {
      const target = OUT.confChamp[conf] === t ? 1 : 0;
      const base = (proj[t].probmakeplayoffs / 100) * Math.exp((0.9 + 1.6 * k) * z[t]);
      const v = base * (1 - k) + target * k * 4 + 0.001;
      raw[t] = Math.max(v + noise(0.03), 0.0005);
      sum += raw[t];
    }
    for (const t of teams) proj[t].probmaketitlegame = round1((raw[t] / sum) * 100);
  }

  // Win Super Bowl (probwintitle): league sums ~100, gated by make-SB odds.
  {
    const teams = Object.keys(STRENGTH);
    const z = priorStrengthZ(teams);
    const raw = {};
    let sum = 0;
    for (const t of teams) {
      const target = OUT.champion === t ? 1 : 0;
      const base = (proj[t].probmaketitlegame / 100) * Math.exp((0.6 + 1.4 * k) * z[t]);
      const v = base * (1 - k) + target * k * 3 + 0.0005;
      raw[t] = Math.max(v + noise(0.02), 0.0002);
      sum += raw[t];
    }
    for (const t of teams) proj[t].probwintitle = round1((raw[t] / sum) * 100);
  }

  // Make conf championship (for completeness; not charted): blend make-SB upward a bit.
  for (const conf of ['AFC', 'NFC']) {
    const teams = conferenceTeams(conf);
    for (const t of teams) {
      proj[t].probmakeconfchamp = round1(clamp(proj[t].probmaketitlegame * 1.8, 0, 100));
    }
  }

  return proj;
}

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function round1(v) { return Math.round(v * 10) / 10; }

function regWeekDate(week) {
  const start = Date.UTC(2025, 8, 3); // Wed Sep 3, 2025 (before Week 1 TNF)
  return new Date(start + (week - 1) * 7 * 86400000).toISOString().slice(0, 10);
}
const PLAYOFF_SNAPS = [
  { label: 'Wild Card', date: '2026-01-07', week: 19 },
  { label: 'Divisional', date: '2026-01-14', week: 20 },
  { label: 'Conf Champ', date: '2026-01-21', week: 21 },
  { label: 'Super Bowl', date: '2026-02-04', week: 22 },
];

// --- Stat leaders: real 2025 names/totals + synthesized weekly cumulative curves ---
async function buildLeaderSeries() {
  const teams = await fetchTeams();
  const teamIdToAbbr = Object.fromEntries(teams.map((t) => [t.id, t.abbr]));
  const cache = readJson(ATHLETE_CACHE_PATH, {});
  let finalLeaders;
  try {
    finalLeaders = await fetchLeaders(SEASON, teamIdToAbbr, cache, 10);
    writeJson(ATHLETE_CACHE_PATH, cache);
  } catch (e) {
    console.warn('Could not fetch real 2025 leaders; using minimal fallback.', e.message);
    finalLeaders = {};
  }

  const rateCats = new Set(['quarterbackRating']);
  // Precompute per-athlete weekly pace shares for cumulative stats.
  const series = {}; // cat -> week(1..18) -> [ {athlete..., value} ]
  for (const { key } of LEADER_CATEGORIES) {
    const finals = finalLeaders[key];
    if (!finals || !finals.length) continue;
    const isRate = rateCats.has(key);
    const paces = finals.map((a) => {
      const shares = Array.from({ length: REG_WEEKS }, () => 0.6 + rand() * 0.9);
      const s = shares.reduce((x, y) => x + y, 0);
      return shares.map((v) => v / s);
    });
    series[key] = {};
    for (let w = 1; w <= REG_WEEKS; w++) {
      const rows = finals.map((a, i) => {
        let value;
        if (isRate) {
          const conv = w / REG_WEEKS;
          value = round1(a.value + noise(9 * (1 - conv)));
        } else {
          const cum = paces[i].slice(0, w).reduce((x, y) => x + y, 0);
          value = Math.round(a.value * cum);
        }
        return { ...a, value };
      });
      rows.sort((x, y) => y.value - x.value);
      series[key][w] = rows;
    }
  }
  return series;
}

async function main() {
  ensureDirs();
  console.log('Generating mocked 2025 season...');
  const leaderSeries = await buildLeaderSeries();
  const catCount = Object.keys(leaderSeries).length;
  console.log(`Leader categories synthesized: ${catCount}`);

  const snapshots = [];
  // Regular season weeks 1..18
  for (let w = 1; w <= REG_WEEKS; w++) {
    const leaders = {};
    for (const cat of Object.keys(leaderSeries)) leaders[cat] = leaderSeries[cat][w];
    snapshots.push({
      key: `${SEASON}-W${String(w).padStart(2, '0')}`,
      label: `Wk ${w}`,
      date: regWeekDate(w),
      week: w,
      phase: 'regular',
      capturedAt: regWeekDate(w) + 'T16:00:00Z',
      projectionsSource: 'mock',
      projections: buildProjections(w - 1, false, 0),
      leaders,
    });
  }
  // Playoffs (projections sharpen; leaders frozen at regular-season finals -> omitted)
  PLAYOFF_SNAPS.forEach((p, i) => {
    snapshots.push({
      key: `${SEASON}-W${String(p.week).padStart(2, '0')}`,
      label: p.label,
      date: p.date,
      week: p.week,
      phase: 'playoffs',
      capturedAt: p.date + 'T16:00:00Z',
      projectionsSource: 'mock',
      projections: buildProjections(REG_WEEKS - 1, true, i),
      leaders: {},
    });
  });

  const seasonData = {
    season: SEASON,
    label: '2025 (mocked — not fully accurate)',
    mocked: true,
    started: true,
    seasonStart: '2025-09-04',
    lastUpdated: new Date().toISOString(),
    phase: 'playoffs',
    outcome: {
      champion: OUT.champion,
      superBowl: OUT.sbTeams,
      divisionWinners: OUT.divWinners,
    },
    snapshots,
  };
  saveSeason(SEASON, seasonData);
  rebuildIndex();
  console.log(
    `Wrote 2025 mock: ${snapshots.length} snapshots. Champion=${OUT.champion}, SB=${OUT.sbTeams.join(' vs ')}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
