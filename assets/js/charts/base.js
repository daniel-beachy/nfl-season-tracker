// Shared Chart.js helpers: theme-aware styling + a line-chart factory + instance registry.
import { isDark, currentTheme } from '../theme.js';

const charts = [];

export function destroyAllCharts() {
  while (charts.length) {
    const c = charts.pop();
    try { c.destroy(); } catch {}
  }
}

export function themeColors() {
  const dark = isDark();
  return {
    grid: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    ticks: dark ? 'rgba(230,237,243,0.75)' : 'rgba(20,28,38,0.75)',
    fg: dark ? '#e6edf3' : '#141c26',
    tooltipBg: dark ? 'rgba(20,28,38,0.96)' : 'rgba(255,255,255,0.98)',
    tooltipFg: dark ? '#e6edf3' : '#141c26',
    tooltipBorder: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
  };
}

// datasets: array of Chart.js datasets, each may carry `_value` formatter via opts.valueFmt.
export function makeLineChart(canvas, { labels, datasets }, opts = {}) {
  const {
    legend = 'right',
    yMax = null,
    yMin = 0,
    valueFmt = (v) => v,
    yTitle = '',
    tooltipName = (ds) => ds._fullName || ds.label,
  } = opts;
  const tc = themeColors();
  // With only 1–2 snapshots (e.g., preseason), lines are invisible — show points instead.
  const sparseRadius = labels.length <= 2 ? 4 : 0;

  const chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      spanGaps: true,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      elements: {
        point: { radius: sparseRadius, hoverRadius: 5, hitRadius: 8 },
        line: { borderWidth: 2, tension: 0.25 },
      },
      plugins: {
        legend: {
          display: legend !== false,
          position: legend === false ? 'right' : legend,
          labels: {
            color: tc.ticks,
            usePointStyle: true,
            pointStyle: 'line',
            boxWidth: 22,
            boxHeight: 2,
            font: { size: 11 },
          },
        },
        tooltip: {
          backgroundColor: tc.tooltipBg,
          titleColor: tc.tooltipFg,
          bodyColor: tc.tooltipFg,
          borderColor: tc.tooltipBorder,
          borderWidth: 1,
          padding: 10,
          usePointStyle: true,
          callbacks: {
            label: (ctx) => {
              const ds = ctx.dataset;
              const name = tooltipName(ds);
              return `  ${name}: ${valueFmt(ctx.parsed.y)}`;
            },
          },
          itemSort: (a, b) => b.parsed.y - a.parsed.y,
        },
      },
      scales: {
        x: {
          grid: { color: tc.grid, drawTicks: false },
          ticks: { color: tc.ticks, maxRotation: 0, autoSkipPadding: 12, font: { size: 10 } },
          border: { color: tc.grid },
        },
        y: {
          min: yMin,
          max: yMax,
          title: { display: !!yTitle, text: yTitle, color: tc.ticks, font: { size: 11 } },
          grid: { color: tc.grid, drawTicks: false },
          ticks: { color: tc.ticks, font: { size: 10 } },
          border: { color: tc.grid },
        },
      },
    },
  });
  charts.push(chart);
  return chart;
}

export { currentTheme };
