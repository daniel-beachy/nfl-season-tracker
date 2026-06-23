# 🏈 NFL Season Tracker

A **fully static**, **keyless**, **free-to-host** dashboard that visualizes how every NFL team's
playoff/championship outlook and the league's statistical leaders evolve over a season — with a
**season selector** so data accumulates year over year.

Data is captured as periodic **JSON snapshots** committed to this repo by a scheduled GitHub
Action (weekly during the season, monthly in the offseason). The live site is a static
**GitHub Pages** app: no backend, no database, no API keys.

![tabs: Projections + Stat Leaders, dark/light, team-colored lines](#)

---

## Features

- **Season (year) selector** — pick any captured season; data grows each year.
- **Projections tab** (per season, plotted over time, team-colored lines, tooltips + legend):
  - **Make the Super Bowl** — AFC (16) + NFC (16)
  - **Win the Super Bowl** — AFC (16) + NFC (16)
  - **Win Division** — 8 charts × 4 teams, **normalized to sum to 100%**
  - **Make the Playoffs** — AFC + NFC
  - **Projected Win Total** — week-over-week, per team
- **Stat Leaders tab** — top-10 per category (passing/rushing/receiving yards & TDs, receptions,
  total TDs, sacks, interceptions, tackles, QB rating) as both a **week-over-week cumulative line
  chart** and **current-total leaderboard cards**.
- **Dark / light toggle** (persisted). Team line colors auto-pick `color` vs `alternateColor`
  by luminance so they stay visible in either theme.
- **Banners**: seasons backfilled with synthesized data are flagged **"mocked — not fully
  accurate"**; seasons that haven't kicked off show **"preseason — season not started"** alongside
  whatever sparse monthly snapshots exist.

### Seasons shipped

- **2025** — backfilled with **plausible mocked weekly data** (clearly labeled). Projections
  evolve from strength-based preseason priors toward simulated outcomes and sharpen into the
  playoffs. Stat-leader **names and final totals are real 2025 data** from ESPN; the weekly
  cumulative split is synthesized.
- **2026** — wired for **live capture**. Until kickoff it holds sparse monthly offseason
  snapshots and shows the preseason banner.

---

## How it works

```
ESPN keyless endpoints ──▶ scripts/capture.mjs ──▶ data/seasons/{year}.json  (committed)
   (power index, leaders,        (GitHub Action,           data/index.json
    team colors)                  Wed cron)                data/teams.json
                                                                │
                              GitHub Pages (static) ◀───────────┘
                              index.html + assets/* render the JSON with Chart.js
```

### Snapshot model

Each capture appends/updates one record in the season file, keyed by **season + week**
(in-season, weekly) or **season + `YYYY-MM`** (offseason/preseason, monthly). The monthly key is
idempotent — repeat Wednesday runs in the same month refresh that month's single point, giving
monthly granularity from a single weekly cron. Charts render the resulting time series.

```jsonc
// data/seasons/2026.json
{
  "season": 2026,
  "label": "2026",
  "mocked": false,
  "started": false,           // drives the "season not started" banner
  "seasonStart": "2026-09-09",
  "phase": "offseason",
  "snapshots": [
    {
      "key": "2026-2026-06", "label": "Jun 2026", "date": "2026-06-23",
      "week": null, "phase": "offseason",
      "projections": {
        "KC": { "projectedw": 9.8, "probwindiv": 38.2, "probmakeplayoffs": 67.6,
                "probmaketitlegame": 10.4, "probwintitle": 4.9, "probmakeconfchamp": 20.6 }
        /* ...32 teams... */
      },
      "leaders": { /* category -> top 10 (empty until the season starts) */ }
    }
  ]
}
```

### Data sources (ESPN, keyless, undocumented)

| Purpose | Endpoint |
| --- | --- |
| Projections | `https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex` |
| Leaders | `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/{YEAR}/types/2/leaders` |
| Team colors | `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams` |

Projection fields come from zipping the power index's `categories[name=projections].names[]` with
each team's `categories[name=projections].values[]`:
`probmaketitlegame` (make SB), `probwintitle` (win SB), `probwindiv`, `probmakeplayoffs`,
`projectedw`. Leader `athlete`/`team` are `$ref` links; athletes are resolved once and cached in
`data/athlete-cache.json`. Conference/division aren't exposed by ESPN, so they're hardcoded in
`scripts/lib/teams-map.mjs`.

---

## Project layout

```
index.html                     static entry point
assets/
  css/styles.css               theme variables + layout
  js/
    app.js                     bootstrap: data load, tabs, season selector, theme, banners
    data.js                    JSON loading + time-series transforms
    theme.js                   dark/light toggle (persisted)
    util.js                    color/luminance + formatting helpers
    leaders-config.js          leader category display metadata
    charts/
      base.js                  Chart.js factory + theme styling + instance registry
      projections.js           all projection charts
      leaders.js               leader line charts + leaderboard cards
  vendor/chart.umd.js          vendored Chart.js v4 (no CDN, no build step)
data/
  index.json                   season list + metadata (drives the dropdown)
  teams.json                   team meta: colors, conference, division
  athlete-cache.json           athlete id -> name/pos cache
  seasons/{year}.json          per-season snapshots
scripts/
  capture.mjs                  main capture entrypoint (GitHub Action)
  build-teams.mjs              regenerate data/teams.json
  generate-mock-2025.mjs       generate the mocked 2025 season
  dev-server.mjs               local static server (npm run serve)
  lib/                         espn.mjs, phase.mjs, store.mjs, teams-map.mjs
.github/workflows/
  capture.yml                  Wed cron -> capture -> commit JSON
  deploy.yml                   deploy static site to GitHub Pages
```

---

## Run locally

Requires **Node 18+** (uses built-in `fetch`). No dependencies to install for the app itself.

```bash
npm run serve         # http://localhost:8125
```

Regenerate / capture data:

```bash
npm run teams         # refresh data/teams.json from ESPN
npm run mock:2025     # (re)generate the mocked 2025 season
npm run capture       # capture the current season "now"
node scripts/capture.mjs --date 2026-09-10   # simulate a capture date (testing)
```

---

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo (default branch `main`).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. The **Deploy** workflow publishes the site on every push to `main`.
4. The **Capture** workflow runs every Wednesday (16:00 UTC), commits any new snapshot to
   `data/`, and that commit triggers a redeploy. Trigger it manually any time from the Actions
   tab ("Capture NFL snapshot" → *Run workflow*), optionally passing a date to backfill.

Everything is free: GitHub Pages + GitHub Actions, no third-party services or secrets.

---

## Extending

- **New stat categories**: add the ESPN category key to `LEADER_CATEGORIES` in
  `scripts/lib/espn.mjs` and a label in `assets/js/leaders-config.js`.
- **New seasons**: they're created automatically the first time `capture.mjs` runs for a season
  ESPN reports as current; the dropdown rebuilds from `data/index.json`.
- **Colors/theme**: tweak CSS variables in `assets/css/styles.css`.

## Notes & disclaimers

- Mocked 2025 data is for demonstration and is **not** an accurate record of the 2025 season.
- ESPN endpoints are undocumented and may change without notice; the capture script fails soft
  (retries, skips leaders when unavailable) and never blocks the static site from rendering.
