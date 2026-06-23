// Client-side display metadata for leader categories. Auto-adapts to whatever
// categories exist in the data; known keys get nice labels/groups.
const DISPLAY = {
  passingYards: { label: 'Passing Yards', unit: 'YDS', group: 'Passing' },
  passingTouchdowns: { label: 'Passing TDs', unit: 'TD', group: 'Passing' },
  quarterbackRating: { label: 'QB Rating', unit: 'RAT', group: 'Passing' },
  rushingYards: { label: 'Rushing Yards', unit: 'YDS', group: 'Rushing' },
  rushingTouchdowns: { label: 'Rushing TDs', unit: 'TD', group: 'Rushing' },
  receivingYards: { label: 'Receiving Yards', unit: 'YDS', group: 'Receiving' },
  receivingTouchdowns: { label: 'Receiving TDs', unit: 'TD', group: 'Receiving' },
  receptions: { label: 'Receptions', unit: 'REC', group: 'Receiving' },
  totalTouchdowns: { label: 'Total TDs', unit: 'TD', group: 'Scoring' },
  sacks: { label: 'Sacks', unit: 'SACK', group: 'Defense' },
  interceptions: { label: 'Interceptions', unit: 'INT', group: 'Defense' },
  totalTackles: { label: 'Total Tackles', unit: 'TOT', group: 'Defense' },
};

const GROUP_ORDER = ['Passing', 'Rushing', 'Receiving', 'Scoring', 'Defense', 'Other'];

function humanize(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export function categoryMeta(key) {
  return DISPLAY[key] || { label: humanize(key), unit: '', group: 'Other' };
}

export function groupsInOrder() {
  return GROUP_ORDER;
}

// Returns ordered list of {key, label, unit, group} present across a season's snapshots.
export function categoriesPresent(season) {
  const keys = new Set();
  for (const s of season.snapshots || []) {
    if (s.leaders) for (const k of Object.keys(s.leaders)) {
      if (Array.isArray(s.leaders[k]) && s.leaders[k].length) keys.add(k);
    }
  }
  const list = [...keys].map((k) => ({ key: k, ...categoryMeta(k) }));
  list.sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group);
    const gb = GROUP_ORDER.indexOf(b.group);
    return ga !== gb ? ga - gb : a.label.localeCompare(b.label);
  });
  return list;
}
