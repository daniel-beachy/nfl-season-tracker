// Stat Leaders tab: per-category week-over-week line chart + current-total leaderboard cards.
import { leaderSeries, currentLeaders } from '../data.js';
import { teamColor, fmtNum } from '../util.js';
import { makeLineChart } from './base.js';
import { categoriesPresent, groupsInOrder } from '../leaders-config.js';

function teamOf(teamsMeta, abbr) {
  return teamsMeta.teams[abbr] || { name: abbr || 'FA', color: '#888', altColor: '#888' };
}

function leaderboard(season, cat, teamsMeta, isDark) {
  const rows = currentLeaders(season, cat.key);
  const box = document.createElement('div');
  box.className = 'leaderboard';
  rows.forEach((r, i) => {
    const team = teamOf(teamsMeta, r.teamAbbr);
    const item = document.createElement('div');
    item.className = 'lb-row';
    item.innerHTML = `
      <span class="lb-rank">${i + 1}</span>
      <span class="lb-chip" style="background:${teamColor(team, isDark)}"></span>
      <span class="lb-name">${r.name}${r.pos ? ` <span class="lb-pos">${r.pos}</span>` : ''}</span>
      <span class="lb-team">${r.teamAbbr || ''}</span>
      <span class="lb-val">${fmtNum(r.value)}</span>`;
    box.appendChild(item);
  });
  return box;
}

function categoryCard(season, cat, teamsMeta, isDark) {
  const card = document.createElement('div');
  card.className = 'card leader-card';
  card.dataset.group = cat.group;

  const head = document.createElement('div');
  head.className = 'chart-head';
  head.innerHTML = `<h3 class="chart-title">${cat.label}</h3><span class="chart-sub">Top 10 · ${cat.unit || ''}</span>`;
  card.appendChild(head);

  const body = document.createElement('div');
  body.className = 'leader-body';

  const chartWrap = document.createElement('div');
  chartWrap.className = 'chart-wrap leader-chart';
  const canvas = document.createElement('canvas');
  chartWrap.appendChild(canvas);
  body.appendChild(chartWrap);

  body.appendChild(leaderboard(season, cat, teamsMeta, isDark));
  card.appendChild(body);

  const { labels, datasets } = leaderSeries(season, cat.key);
  const dsList = datasets.map((d) => {
    const team = teamOf(teamsMeta, d.athlete.teamAbbr);
    const color = teamColor(team, isDark);
    return {
      label: d.athlete.shortName || d.athlete.name,
      _fullName: `${d.athlete.name}${d.athlete.teamAbbr ? ` · ${d.athlete.teamAbbr}` : ''}`,
      data: d.data,
      borderColor: color,
      backgroundColor: color,
      pointBackgroundColor: color,
    };
  });

  // Defer chart creation until appended (canvas needs layout).
  queueMicrotask(() => {
    if (!labels.length) {
      chartWrap.innerHTML = '<div class="empty-mini">No weekly history yet.</div>';
      return;
    }
    makeLineChart(canvas, { labels, datasets: dsList }, {
      legend: 'bottom',
      yMin: 0,
      valueFmt: (v) => fmtNum(v),
    });
  });

  return card;
}

export function renderLeaders(container, season, teamsMeta, isDark) {
  container.innerHTML = '';
  const cats = categoriesPresent(season);

  if (!cats.length) {
    container.innerHTML =
      '<div class="empty-state"><h3>No stat leaders yet</h3>' +
      '<p>Leaders are captured once the season is underway. Check back after Week 1.</p></div>';
    return;
  }

  // Group filter chips.
  const groups = ['All', ...groupsInOrder().filter((g) => cats.some((c) => c.group === g))];
  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  const grid = document.createElement('div');
  grid.className = 'leader-grid';

  groups.forEach((g, i) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (i === 0 ? ' active' : '');
    chip.textContent = g;
    chip.addEventListener('click', () => {
      filterBar.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      grid.querySelectorAll('.leader-card').forEach((card) => {
        card.style.display = g === 'All' || card.dataset.group === g ? '' : 'none';
      });
    });
    filterBar.appendChild(chip);
  });

  container.appendChild(filterBar);
  container.appendChild(grid);
  for (const cat of cats) grid.appendChild(categoryCard(season, cat, teamsMeta, isDark));
}
