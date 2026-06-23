// Static NFL conference/division mapping (keyed by ESPN team abbreviation).
// ESPN's /teams endpoint does not expose conference/division, so we hardcode it.
// This is stable league structure and changes very rarely.

export const DIVISIONS = {
  'AFC East':  ['BUF', 'MIA', 'NE', 'NYJ'],
  'AFC North': ['BAL', 'CIN', 'CLE', 'PIT'],
  'AFC South': ['HOU', 'IND', 'JAX', 'TEN'],
  'AFC West':  ['DEN', 'KC', 'LV', 'LAC'],
  'NFC East':  ['DAL', 'NYG', 'PHI', 'WSH'],
  'NFC North': ['CHI', 'DET', 'GB', 'MIN'],
  'NFC South': ['ATL', 'CAR', 'NO', 'TB'],
  'NFC West':  ['ARI', 'LAR', 'SF', 'SEA'],
};

// abbr -> { conference, division }
export const TEAM_GROUPS = (() => {
  const map = {};
  for (const [division, abbrs] of Object.entries(DIVISIONS)) {
    const conference = division.startsWith('AFC') ? 'AFC' : 'NFC';
    for (const abbr of abbrs) map[abbr] = { conference, division };
  }
  return map;
})();

export const CONFERENCES = ['AFC', 'NFC'];

export const DIVISION_ORDER = Object.keys(DIVISIONS);

export function conferenceOf(abbr) {
  return TEAM_GROUPS[abbr]?.conference ?? null;
}

export function divisionOf(abbr) {
  return TEAM_GROUPS[abbr]?.division ?? null;
}
