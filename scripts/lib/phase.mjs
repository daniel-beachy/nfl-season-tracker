// Season phase + snapshot-key logic.
// Decides whether a capture is weekly (in-season) or monthly (offseason/preseason),
// and produces a stable key + human label + chronological ordering.

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const DAY = 86400000;

function toDate(v) {
  return v instanceof Date ? v : new Date(v);
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

export function monthLabel(d) {
  d = toDate(d);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// week: 1..18 regular; 19=Wild Card, 20=Divisional, 21=Conf Champ, 22=Super Bowl
export function weekLabel(week) {
  if (week <= 18) return `Wk ${week}`;
  return { 19: 'Wild Card', 20: 'Divisional', 21: 'Conf Champ', 22: 'Super Bowl' }[week] || `Wk ${week}`;
}

// Fallback season calendar if power-index meta is unavailable.
function fallbackMeta(season) {
  return {
    year: season,
    startDate: `${season}-08-06T00:00:00Z`,        // preseason start
    endDate: `${season + 1}-02-16T00:00:00Z`,      // through Super Bowl
    type: {
      startDate: `${season}-09-08T00:00:00Z`,      // regular season start
      endDate: `${season + 1}-01-13T00:00:00Z`,    // end of regular season
      week: {},
    },
  };
}

// Returns { season, phase, started, snapshot:{key,label,date,week,phase} } for a capture at `now`.
export function computeSnapshot(now, seasonMeta) {
  now = toDate(now);
  const meta = seasonMeta && seasonMeta.year ? seasonMeta : fallbackMeta(seasonMeta?.year ?? now.getUTCFullYear());
  const season = meta.year;

  const overallStart = toDate(meta.startDate);
  const overallEnd = toDate(meta.endDate);
  const regStart = toDate(meta.type?.startDate || meta.startDate);
  const regEnd = toDate(meta.type?.endDate || meta.endDate);

  let phase;
  if (now < overallStart) phase = 'offseason';
  else if (now < regStart) phase = 'preseason';
  else if (now <= regEnd) phase = 'regular';
  else if (now <= overallEnd) phase = 'playoffs';
  else phase = 'offseason';

  const started = now >= regStart;
  const inSeason = phase === 'regular' || phase === 'playoffs';

  let snapshot;
  if (inSeason) {
    let week;
    const metaWeek = meta.type?.week?.number;
    if (phase === 'regular') {
      week = metaWeek && metaWeek > 0
        ? metaWeek
        : clamp(Math.floor((now - regStart) / (7 * DAY)) + 1, 1, 18);
    } else {
      // playoffs: split the post-regular window into 4 rounds
      const span = Math.max(1, overallEnd - regEnd);
      const frac = clamp((now - regEnd) / span, 0, 0.999);
      week = 19 + Math.floor(frac * 4); // 19..22
    }
    snapshot = {
      key: `${season}-W${String(week).padStart(2, '0')}`,
      label: weekLabel(week),
      date: ymd(now),
      week,
      phase,
    };
  } else {
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    snapshot = {
      key: `${season}-${ym}`,
      label: monthLabel(now),
      date: ymd(now),
      week: null,
      phase,
    };
  }

  return { season, phase, started, snapshot };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
