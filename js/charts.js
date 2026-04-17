/*
 * charts.js
 * Chart creation and helpers that wrap Chart.js usage.
 * Exports small helpers used by `panels.js` and `main.js`.
 */
import { esc, fmtVal, fmtTickNumber } from './utils.js';

// Build a palette on demand so the first color follows the active theme accent.
export function getColors(){
  const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#4af0c4';
  return [accent, '#f06060', '#f0c040', '#60a8f0', '#c060f0', '#f08040', '#60e060', '#f060c0', '#80c0ff', '#ffb060'];
}
const FALLBACK_MUTED = '#5c6880';
const FALLBACK_GRID = 'rgba(35,44,62,0.8)';

export function getMuted(){
  const v = getComputedStyle(document.body).getPropertyValue('--muted').trim();
  return v || FALLBACK_MUTED;
}

function hexToRgb(hex){
  const h = String(hex || '').trim().replace('#', '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

export function getGridColor(){
  const muted = getMuted();
  const rgb = hexToRgb(muted);
  if (!rgb) return FALLBACK_GRID;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`;
}

Chart.defaults.font.family = "'DM Mono', monospace";
Chart.defaults.font.size   = 11;
Chart.defaults.color       = getMuted();
Chart.defaults.borderColor = getGridColor();

/** All created chart instances are tracked so they can be destroyed on reload. */
export const allCharts = [];
export function destroyAll() { allCharts.forEach(c => c.destroy()); allCharts.length = 0; }

/**
 * Create a Chart.js chart mounted on `canvas`.
 * Returns the created Chart instance.
 */
export function mkChart(canvas, type, labels, datasets, opts) {
  const colors = getColors();
  const muted = getMuted();
  const gridColor = getGridColor();
  const xTickFormatter = opts && typeof opts.xTickFormatter === 'function' ? opts.xTickFormatter : null;
  const yTickFormatter = opts && typeof opts.yTickFormatter === 'function' ? opts.yTickFormatter : null;
  const xScale = {
    title: { display: !!(opts && opts.xLabelDisplay), text: opts && opts.xLabel, color: muted },
    grid: { color: gridColor },
    ticks: { autoSkip: false, maxRotation: 40, color: muted },
    ...(opts && opts.xType ? { type: opts.xType } : {}),
    ...(opts && opts.xMin != null ? { min: opts.xMin } : {}),
    ...(opts && opts.xMax != null ? { max: opts.xMax } : {}),
  };
  if (xTickFormatter) {
    xScale.ticks = {
      ...xScale.ticks,
      callback: v => xTickFormatter(v),
    };
  } else if (opts && (opts.xType === 'linear' || opts.xType === 'logarithmic')) {
    xScale.ticks = {
      ...xScale.ticks,
      callback: v => fmtTickNumber(v),
    };
  }
  const yScale = {
    title: { display: !!(opts && opts.yLabel), text: opts && opts.yLabel, color: muted },
    grid: { color: gridColor },
    ticks: { callback: v => fmtVal(v, opts && opts.yUnit), color: muted },
    ...(opts && opts.yType ? { type: opts.yType } : {}),
    ...(opts && opts.yMin != null ? { min: opts.yMin } : {}),
    ...(opts && opts.yMax != null ? { max: opts.yMax } : {}),
  };
  if (opts && opts.xLog) xScale.type = 'logarithmic';
  if (opts && opts.yLog) yScale.type = 'logarithmic';
  if (yTickFormatter) {
    yScale.ticks = {
      ...yScale.ticks,
      callback: v => yTickFormatter(v),
    };
  }
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
      maintainAspectRatio: !!(opts && opts.maintainAspectRatio),
      aspectRatio: opts && opts.aspectRatio ? opts.aspectRatio : 2,
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
        x: xScale,
        y: yScale,
      }
    }
  });
  // Ensure any auxiliary diagonal datasets span the chart scales exactly
  try {
    c.data.datasets.forEach(ds => {
      if (!ds || !ds.__auxiliary) return;
      // expect two points forming a diagonal; map them to current scale mins/maxs
      if (c.scales && c.scales.x && c.scales.y && Array.isArray(ds.data) && ds.data.length >= 2) {
        const xmin = c.scales.x.min;
        const xmax = c.scales.x.max;
        const ymin = c.scales.y.min;
        const ymax = c.scales.y.max;
        // Use the common min/max for square diagonal when available
        const low = Math.min(xmin, ymin);
        const high = Math.max(xmax, ymax);
        ds.data[0] = { x: low, y: low };
        ds.data[1] = { x: high, y: high };
      }
    });
    c.update();
  } catch (e) { /* non-fatal */ }
  allCharts.push(c);
  return c;
}

/** Update dataset colors for existing charts (useful on theme change). */
export function updateChartColors(){
  const colors = getColors();
  const muted = getMuted();
  const gridColor = getGridColor();
  Chart.defaults.color = muted;
  Chart.defaults.borderColor = gridColor;
  for (const c of allCharts){
    c.data.datasets.forEach((ds,i)=>{
      if (ds && ds.__auxiliary) {
        ds.borderColor = muted;
        ds.backgroundColor = 'transparent';
        return;
      }
      const col = colors[i % colors.length];
      ds.borderColor = col;
      ds.backgroundColor = c.config.type === 'line' ? col + '22' : col + 'bb';
    });
    if (c.options && c.options.scales) {
      if (c.options.scales.x) {
        if (c.options.scales.x.grid) c.options.scales.x.grid.color = gridColor;
        if (c.options.scales.x.ticks) c.options.scales.x.ticks.color = muted;
        if (c.options.scales.x.title) c.options.scales.x.title.color = muted;
      }
      if (c.options.scales.y) {
        if (c.options.scales.y.grid) c.options.scales.y.grid.color = gridColor;
        if (c.options.scales.y.ticks) c.options.scales.y.ticks.color = muted;
        if (c.options.scales.y.title) c.options.scales.y.title.color = muted;
      }
    }
    try{ c.update(); }catch(e){}
  }
}

/** Update legend swatches (DOM-only helper). */
export function updateLegends(){
  const colors = getColors();
  const legs = document.querySelectorAll('.legend');
  legs.forEach(leg => {
    const items = leg.querySelectorAll('.legend-item');
    items.forEach((item, i) => {
      const d = item.querySelector('.legend-dot');
      if (!d) return;
      const col = colors[i % colors.length];
      if (d.style.backgroundImage) {
        d.style.backgroundImage = `repeating-linear-gradient(45deg, ${col} 0, ${col} 1px, transparent 1px, transparent 4px)`;
        d.style.border = `1px solid ${col}`;
      } else if ((d.style.borderStyle || '').includes('dashed')) {
        d.style.border = `2px dashed ${col}`;
      } else {
        d.style.background = col;
      }
    });
  });
}

/** Return HTML for a small legend for the supplied datasets. */
export function legendHtml(datasets) {
  const colors = getColors();
  const visibleDatasets = (datasets || []).filter(ds => !(ds && ds.__auxiliary));
  return '<div class="legend">' +
    visibleDatasets.map((ds, i) => {
      const color = (ds && ds.borderColor && typeof ds.borderColor === 'string')
        ? ds.borderColor
        : colors[i % colors.length];
      const isCompare = !!(ds && ds.__compare);
      const tip = isCompare && ds.__hatch
        ? `${ds.label} (compare, hatched)`
        : (isCompare && ds.__dashed
          ? `${ds.label} (compare, dashed)`
          : String(ds && ds.label || 'Series'));
      let dotHtml = '';
      if (isCompare && ds && ds.__hatch) {
        // hatched square using CSS repeating-linear-gradient
        const c = color;
        dotHtml = `<span class="legend-dot" style="background-image:repeating-linear-gradient(45deg, ${c} 0, ${c} 1px, transparent 1px, transparent 4px); border:1px solid ${c}"></span>`;
      } else if (isCompare && ds && ds.__dashed) {
        dotHtml = `<span class="legend-dot" style="background:transparent; border:2px dashed ${color}; width:12px; height:8px; display:inline-block;
          vertical-align:middle; border-radius:2px"></span>`;
      } else {
        dotHtml = `<span class="legend-dot" style="background:${color}"></span>`;
      }
      return `<span class="legend-item" data-ds-index="${i}" title="${esc(tip)}">${dotHtml}${esc(ds.label)}</span>`;
    }).join('') + '</div>';
}

function bindLegendToggle(legEl, chart, onToggle) {
  if (!legEl || !chart) return;
  const items = legEl.querySelectorAll('.legend-item[data-ds-index]');
  items.forEach(item => {
    const idx = Number(item.getAttribute('data-ds-index'));
    if (!Number.isFinite(idx)) return;
    item.style.cursor = 'pointer';
    item.classList.toggle('off', !chart.isDatasetVisible(idx));
    item.addEventListener('click', () => {
      const isVisible = chart.isDatasetVisible(idx);
      chart.setDatasetVisibility(idx, !isVisible);
      item.classList.toggle('off', isVisible);
      try { chart.update(); } catch (e) {}
      if (typeof onToggle === 'function') {
        const ds = chart.data && Array.isArray(chart.data.datasets) ? chart.data.datasets[idx] : null;
        const label = ds && ds.label != null ? String(ds.label) : '';
        onToggle({
          index: idx,
          label,
          visible: !isVisible,
        });
      }
    });
  });
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
  const wrapEl = el.querySelector('.chart-wrap');
  requestAnimationFrame(() => {
    const out = drawFn(canvas);
    if (out && out.placeholder) {
      try { legEl.remove(); } catch (e) {}
      wrapEl.replaceWith(out.placeholder);
      return;
    }
    const datasets = Array.isArray(out) ? out : (out && Array.isArray(out.datasets) ? out.datasets : null);
    const chart = out && !Array.isArray(out) ? out.chart : null;
    const legendDatasets = out && !Array.isArray(out) && Array.isArray(out.legendDatasets)
      ? out.legendDatasets
      : datasets;
    if (out && out.square) {
      wrapEl.classList.add('square');
      wrapEl.style.height = 'auto';
    }
    if (datasets) {
      if (out && out.noLegend) {
        try { legEl.remove(); } catch (e) {}
        return;
      }
      legEl.innerHTML = legendHtml(legendDatasets);
      if (chart) {
        const onLegendToggle = out && !Array.isArray(out) ? out.onLegendToggle : null;
        bindLegendToggle(legEl, chart, onLegendToggle);
      }
    }
  });
  return el;
}
