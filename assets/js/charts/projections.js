// Projections tab: builds all projection charts for a season.
import { projectionSeries } from '../data.js';
import { teamColor, withAlpha } from '../util.js';
import { makeLineChart } from './base.js';

const pctFmt = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)}%`);
const winFmt = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(1));

function chartCard(title, subtitle, sizeClass) {
  const card = document.createElement('div');
  card.className = 'card chart-card';
  const head = document.createElement('div');
  head.className = 'chart-head';
  const h = document.createElement('h3');
  h.className = 'chart-title';
  h.textContent = title;
  head.appendChild(h);
  if (subtitle) {
    const sub = document.createElement('span');
    sub.className = 'chart-sub';
    sub.textContent = subtitle;
    head.appendChild(sub);
  }
  card.appendChild(head);
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap ' + (sizeClass || '');
  const cv = document.createElement('canvas');
  wrap.appendChild(cv);
  card.appendChild(wrap);
  return { card, canvas: cv };
}

function section(title, hint) {
  const sec = document.createElement('section');
  sec.className = 'proj-section';
  const h = document.createElement('h2');
  h.className = 'section-title';
  h.textContent = title;
  sec.appendChild(h);
  if (hint) {
    const p = document.createElement('p');
    p.className = 'section-hint';
    p.textContent = hint;
    sec.appendChild(p);
  }
  const grid = document.createElement('div');
  grid.className = 'chart-grid';
  sec.appendChild(grid);
  return { sec, grid };
}

// Order legend/lines by each team's peak value over the season, so the most
// prominent lines are listed first even when the final snapshot zeroes teams out
// (e.g., non-champions at the Super Bowl snapshot).
function sortByPeak(season, field, abbrs) {
  const snaps = season.snapshots || [];
  const peak = {};
  for (const a of abbrs) {
    let m = -Infinity;
    for (const s of snaps) {
      const v = s.projections?.[a]?.[field];
      if (typeof v === 'number' && v > m) m = v;
    }
    peak[a] = m;
  }
  return [...abbrs].sort((a, b) => (peak[b] ?? -1) - (peak[a] ?? -1));
}

function buildDatasets(season, field, abbrs, teamsMeta, isDark, normalize) {
  const { labels, datasets } = projectionSeries(season, field, abbrs, { normalize });
  const dsList = datasets.map((d) => {
    const team = teamsMeta.teams[d.abbr] || { name: d.abbr, color: '#888', altColor: '#888' };
    const color = teamColor(team, isDark);
    return {
      label: d.abbr,
      _fullName: team.name,
      data: d.data,
      borderColor: color,
      backgroundColor: color,
      pointBackgroundColor: color,
      pointBorderColor: color,
      pointHoverBackgroundColor: color,
    };
  });
  return { labels, datasets: dsList };
}

function addChart(grid, title, subtitle, season, field, abbrs, teamsMeta, isDark, opts) {
  const sorted = sortByPeak(season, field, abbrs);
  const data = buildDatasets(season, field, sorted, teamsMeta, isDark, opts.normalize);
  const { card, canvas } = chartCard(title, subtitle, opts.sizeClass);
  grid.appendChild(card);
  makeLineChart(canvas, data, {
    legend: opts.legend,
    yMax: opts.yMax ?? null,
    yMin: 0,
    valueFmt: opts.valueFmt,
    yTitle: opts.yTitle || '',
  });
}

export function renderProjections(container, season, teamsMeta, isDark) {
  container.innerHTML = '';
  const conf = (c) =>
    Object.entries(teamsMeta.divisions)
      .filter(([d]) => d.startsWith(c))
      .flatMap(([, t]) => t);

  // 1. Make Super Bowl
  {
    const { sec, grid } = section('Make the Super Bowl', 'Probability a team reaches the Super Bowl (ESPN: prob make title game).');
    addChart(grid, 'AFC', 'Conference reaches Super Bowl ≈ 100%', season, 'probmaketitlegame', conf('AFC'), teamsMeta, isDark, { legend: 'right', valueFmt: pctFmt, sizeClass: 'tall' });
    addChart(grid, 'NFC', 'Conference reaches Super Bowl ≈ 100%', season, 'probmaketitlegame', conf('NFC'), teamsMeta, isDark, { legend: 'right', valueFmt: pctFmt, sizeClass: 'tall' });
    container.appendChild(sec);
  }
  // 2. Win Super Bowl
  {
    const { sec, grid } = section('Win the Super Bowl', 'Championship probability (ESPN: prob win title). All 32 teams sum to ≈ 100%.');
    addChart(grid, 'AFC', null, season, 'probwintitle', conf('AFC'), teamsMeta, isDark, { legend: 'right', valueFmt: pctFmt, sizeClass: 'tall' });
    addChart(grid, 'NFC', null, season, 'probwintitle', conf('NFC'), teamsMeta, isDark, { legend: 'right', valueFmt: pctFmt, sizeClass: 'tall' });
    container.appendChild(sec);
  }
  // 3. Win Division (normalized to 100% per division)
  {
    const { sec, grid } = section('Win Division', 'Per-division odds, normalized to sum to 100%.');
    grid.classList.add('grid-4');
    for (const div of teamsMeta.divisionOrder) {
      addChart(grid, div, null, season, 'probwindiv', teamsMeta.divisions[div], teamsMeta, isDark, { legend: 'bottom', valueFmt: pctFmt, yMax: 100, normalize: true, sizeClass: 'short' });
    }
    container.appendChild(sec);
  }
  // 4. Make Playoffs
  {
    const { sec, grid } = section('Make the Playoffs', 'Probability of reaching the postseason.');
    addChart(grid, 'AFC', null, season, 'probmakeplayoffs', conf('AFC'), teamsMeta, isDark, { legend: 'right', valueFmt: pctFmt, yMax: 100, sizeClass: 'tall' });
    addChart(grid, 'NFC', null, season, 'probmakeplayoffs', conf('NFC'), teamsMeta, isDark, { legend: 'right', valueFmt: pctFmt, yMax: 100, sizeClass: 'tall' });
    container.appendChild(sec);
  }
  // 5. Projected win total
  {
    const { sec, grid } = section('Projected Win Total', 'Projected final regular-season wins (17-game schedule), week over week.');
    addChart(grid, 'AFC', null, season, 'projectedw', conf('AFC'), teamsMeta, isDark, { legend: 'right', valueFmt: winFmt, yMax: 17, yTitle: 'Wins', sizeClass: 'tall' });
    addChart(grid, 'NFC', null, season, 'projectedw', conf('NFC'), teamsMeta, isDark, { legend: 'right', valueFmt: winFmt, yMax: 17, yTitle: 'Wins', sizeClass: 'tall' });
    container.appendChild(sec);
  }
}
