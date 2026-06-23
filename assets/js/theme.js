// Theme management: dark/light toggle, persisted in localStorage.
const KEY = 'nfl-tracker-theme';
const listeners = new Set();

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

export function isDark() {
  return currentTheme() === 'dark';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(KEY, theme); } catch {}
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    btn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  }
  listeners.forEach((fn) => fn(theme));
}

export function toggleTheme() {
  applyTheme(isDark() ? 'light' : 'dark');
}

export function initTheme() {
  let saved;
  try { saved = localStorage.getItem(KEY); } catch {}
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(saved || (prefersLight ? 'light' : 'dark'));
}

// Subscribe to theme changes (e.g., to re-render charts). Returns an unsubscribe fn.
export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
