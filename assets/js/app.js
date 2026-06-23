// App bootstrap: data load, season selector, tabs, theme, banners.
import { initTheme, toggleTheme, onThemeChange, isDark } from './theme.js';
import { loadIndex, loadTeams, loadSeason, latestSnapshot, sortedSnapshots } from './data.js';
import { renderProjections } from './charts/projections.js';
import { renderLeaders } from './charts/leaders.js';
import { destroyAllCharts } from './charts/base.js';

const state = {
  index: null,
  teams: null,
  seasonYear: null,
  season: null,
  tab: 'projections',
};

const els = {};

function cacheEls() {
  els.seasonSelect = document.getElementById('season-select');
  els.themeToggle = document.getElementById('theme-toggle');
  els.banners = document.getElementById('banners');
  els.status = document.getElementById('status');
  els.tabs = [...document.querySelectorAll('.tab')];
  els.projPanel = document.getElementById('panel-projections');
  els.leadersPanel = document.getElementById('panel-leaders');
}

function defaultSeasonYear(index) {
  const started = index.seasons.filter((s) => s.started && s.snapshotCount > 1);
  if (started.length) return started[0].season;
  return index.defaultSeason ?? index.seasons[0]?.season ?? null;
}

function populateSeasons(index) {
  els.seasonSelect.innerHTML = '';
  for (const s of index.seasons) {
    const opt = document.createElement('option');
    opt.value = s.season;
    opt.textContent = s.label;
    els.seasonSelect.appendChild(opt);
  }
}

function banner(kind, title, text) {
  return `<div class="banner ${kind}"><strong>${title}</strong>${text ? ` — ${text}` : ''}</div>`;
}

function updateBanners(season) {
  const parts = [];
  if (!season.started) {
    parts.push(
      banner('warn', 'Preseason — season not started',
        'Showing sparse monthly snapshots until kickoff. Weekly tracking begins in Week 1.')
    );
  }
  if (season.mocked) {
    parts.push(
      banner('mock', 'Mocked data — not fully accurate',
        'This season is backfilled with synthesized weekly data for demonstration.')
    );
  }
  els.banners.innerHTML = parts.join('');
}

function updateStatus(season) {
  const snaps = sortedSnapshots(season);
  const latest = latestSnapshot(season);
  const src = season.mocked ? 'Mocked' : 'ESPN (live)';
  const phase = season.phase ? season.phase[0].toUpperCase() + season.phase.slice(1) : '—';
  els.status.innerHTML =
    `<span class="status-pill">${snaps.length} snapshot${snaps.length === 1 ? '' : 's'}</span>` +
    `<span class="status-pill">Phase: ${phase}</span>` +
    (latest ? `<span class="status-pill">Latest: ${latest.label} · ${latest.date}</span>` : '') +
    `<span class="status-pill">Source: ${src}</span>`;
}

function setTab(tab) {
  state.tab = tab;
  els.tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  els.projPanel.classList.toggle('hidden', tab !== 'projections');
  els.leadersPanel.classList.toggle('hidden', tab !== 'leaders');
  renderActive();
}

function renderActive() {
  destroyAllCharts();
  if (!state.season) return;
  if (state.tab === 'projections') {
    els.leadersPanel.innerHTML = '';
    renderProjections(els.projPanel, state.season, state.teams, isDark());
  } else {
    els.projPanel.innerHTML = '';
    renderLeaders(els.leadersPanel, state.season, state.teams, isDark());
  }
}

async function selectSeason(year) {
  state.seasonYear = year;
  els.seasonSelect.value = String(year);
  try {
    state.season = await loadSeason(year);
  } catch (e) {
    els.banners.innerHTML = banner('warn', 'Could not load season', e.message);
    return;
  }
  updateBanners(state.season);
  updateStatus(state.season);
  renderActive();
}

async function main() {
  initTheme();
  cacheEls();

  els.themeToggle.addEventListener('click', () => toggleTheme());
  onThemeChange(() => renderActive());
  els.tabs.forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
  els.seasonSelect.addEventListener('change', (e) => selectSeason(Number(e.target.value)));

  try {
    [state.index, state.teams] = await Promise.all([loadIndex(), loadTeams()]);
  } catch (e) {
    document.getElementById('app').innerHTML =
      `<div class="empty-state"><h3>Failed to load data</h3><p>${e.message}</p></div>`;
    return;
  }

  populateSeasons(state.index);
  await selectSeason(defaultSeasonYear(state.index));
}

main();
