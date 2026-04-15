/*
 * charts.js
 * Chart creation and helpers that wrap Chart.js usage.
 * Exports small helpers used by `panels.js` and `main.js`.
 */
import { esc, fmtVal } from './utils.js';

// Build a palette on demand so the first color follows the active theme accent.
export function getColors(){
  const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#4af0c4';
  return [accent, '#f06060', '#f0c040', '#60a8f0', '#c060f0', '#f08040', '#60e060', '#f060c0', '#80c0ff', '#ffb060'];
}
export const GRID = 'rgba(35,44,62,0.8)';
export const MUTED = '#5c6880';

Chart.defaults.font.family = "'DM Mono', monospace";
Chart.defaults.font.size   = 11;
Chart.defaults.color       = MUTED;
Chart.defaults.borderColor = GRID;

/** All created chart instances are tracked so they can be destroyed on reload. */
export const allCharts = [];
export function destroyAll() { allCharts.forEach(c => c.destroy()); allCharts.length = 0; }

/**
 * Create a Chart.js chart mounted on `canvas`.
 * Returns the created Chart instance.
 */
export function mkChart(canvas, type, labels, datasets, opts) {
  const colors = getColors();
  const c = new Chart(canvas, {
    type,
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        borderColor:     colors[i % colors.length],
        backgroundColor: type === 'line'
          ? colors[i % colors.length] + '22'
          : colors[i % colors.length] + 'bb',
        borderWidth: type === 'line' ? 2 : 1,
        pointRadius: 3,
        tension: 0.3,
        fill: false,
        ...ds,
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmtVal(ctx.parsed.y, opts.yUnit)}`
          }
        }
      },
      scales: {
        x: {
          title: { display: false, text: opts && opts.xLabel, color: MUTED },
          grid: { color: GRID },
          ticks: { autoSkip: false, maxRotation: 40 },
        },
        y: {
          title: { display: !!(opts && opts.yLabel), text: opts && opts.yLabel, color: MUTED },
          grid: { color: GRID },
          ticks: { callback: v => fmtVal(v, opts && opts.yUnit) },
          ...(opts && opts.log ? { type: 'logarithmic' } : {}),
        }
      }
    }
  });
  allCharts.push(c);
  return c;
}

/** Update dataset colors for existing charts (useful on theme change). */
export function updateChartColors(){
  const colors = getColors();
  for (const c of allCharts){
    c.data.datasets.forEach((ds,i)=>{
      const col = colors[i % colors.length];
      ds.borderColor = col;
      ds.backgroundColor = c.config.type === 'line' ? col + '22' : col + 'bb';
    });
    try{ c.update(); }catch(e){}
  }
}

/** Update legend swatches (DOM-only helper). */
export function updateLegends(){
  const colors = getColors();
  const legs = document.querySelectorAll('.legend');
  legs.forEach(leg => {
    const dots = leg.querySelectorAll('.legend-dot');
    dots.forEach((d,i) => {
      d.style.background = colors[i % colors.length];
    });
  });
}

/** Return HTML for a small legend for the supplied datasets. */
export function legendHtml(datasets) {
  const colors = getColors();
  return '<div class="legend">' +
    datasets.map((ds, i) =>
      `<span><span class="legend-dot" style="background:${colors[i % colors.length]}"></span>${esc(ds.label)}</span>`
    ).join('') + '</div>';
}

/** Small helper that builds a card DOM node and runs `drawFn` to populate its canvas. */
export function chartCard(titleStr, subStr, heightPx, drawFn) {
  const el = document.createElement('div');
  el.className = 'chart-card';
  el.innerHTML =
    `<div class="chart-title">${esc(titleStr)}</div>` +
    `<div class="chart-sub">${esc(subStr)}</div>` +
    `<div class="chart-wrap" style="height:${heightPx}px"><canvas></canvas></div>` +
    `<div class="leg"></div>`;
  const canvas = el.querySelector('canvas');
  const legEl  = el.querySelector('.leg');
  requestAnimationFrame(() => {
    const ds = drawFn(canvas);
    if (ds) legEl.innerHTML = legendHtml(ds);
  });
  return el;
}
