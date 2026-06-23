// Color + formatting utilities (no dependencies).

export function hexToRgb(hex) {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return { r: 128, g: 128, b: 128 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function channelLum(v) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
}

export function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

// Pick the most visible brand color for the given theme background, nudging if needed.
export function teamColor(team, isDark) {
  const bg = isDark ? '#10161f' : '#ffffff';
  const fg = isDark ? '#ffffff' : '#0b0f14';
  const c1 = team.color || '#888888';
  const c2 = team.altColor || '#888888';
  const con1 = contrastRatio(c1, bg);
  const con2 = contrastRatio(c2, bg);
  let chosen = con1 >= 2.0 ? c1 : con2 > con1 ? c2 : c1;
  // Guarantee a minimum visibility against the background.
  let con = contrastRatio(chosen, bg);
  let guard = 0;
  while (con < 2.0 && guard < 6) {
    chosen = mix(chosen, fg, 0.18);
    con = contrastRatio(chosen, bg);
    guard++;
  }
  return chosen;
}

export function withAlpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function fmtPct(v) {
  return v === null || v === undefined ? '—' : `${Number(v).toFixed(1)}%`;
}

export function fmtNum(v) {
  if (v === null || v === undefined) return '—';
  return Number.isInteger(v) ? String(v) : Number(v).toFixed(1);
}
