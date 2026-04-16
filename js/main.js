/*
 * main.js
 * Entrypoint module that wires DOM interactions (file input, drag/drop,
 * theme toggle) and orchestrates loading benchmark JSON into the UI.
 */
import { destroyAll, updateChartColors, updateLegends } from './charts.js';
import { groupByPrefix, esc, fmtNs } from './utils.js';
import { buildPanel } from './panels.js';

let baseData = null;
let compareByGroup = new Map();
let compareTimestamp = null;

function setBenchmarkActionsVisible(visible) {
  const display = visible ? '' : 'none';
  const newViewBtn = document.getElementById('new-view-btn');
  const compareBtn = document.getElementById('compare-btn');
  if (newViewBtn) newViewBtn.style.display = display;
  if (compareBtn) compareBtn.style.display = display;
}

function resetViewer() {
  destroyAll();
  baseData = null;
  compareByGroup = new Map();
  compareTimestamp = null;

  const summary = document.getElementById('summary');
  const tabs = document.getElementById('tabs');
  const panels = document.getElementById('panels');
  const content = document.getElementById('content');
  const dropZone = document.getElementById('drop-zone');
  const meta = document.getElementById('meta');
  const compareBtn = document.getElementById('compare-btn');
  const fileInput = document.getElementById('file-input');
  const compareFileInput = document.getElementById('compare-file-input');

  setBenchmarkActionsVisible(false);

  if (summary) summary.innerHTML = '';
  if (tabs) tabs.innerHTML = '';
  if (panels) panels.innerHTML = '';
  if (content) content.style.display = 'none';
  if (dropZone) dropZone.style.display = 'block';
  if (meta) meta.textContent = 'Drop a bench_results.json to begin.';

  if (compareBtn) {
    compareBtn.disabled = true;
    compareBtn.textContent = 'Compare';
    compareBtn.title = 'Load compare benchmark JSON';
  }

  if (fileInput) fileInput.value = '';
  if (compareFileInput) compareFileInput.value = '';
}

function normalizeBenchmarks(data) {
  const benchmarks = (data.benchmarks || []).filter(r => !r.is_aggregate && r.name);

  function timeToNs(val, unit) {
    if (val == null) return null;
    switch ((unit || '').toLowerCase()) {
      case 'ns': return Number(val);
      case 'us': return Number(val) * 1e3;
      case 'ms': return Number(val) * 1e6;
      case 's':  return Number(val) * 1e9;
      default:   return Number(val);
    }
  }

  for (const r of benchmarks) {
    r.real_time_ns = r.real_time_ns != null ? r.real_time_ns : timeToNs(r.real_time, r.time_unit || (data.time_unit || 'us'));
    r.cpu_time_ns  = r.cpu_time_ns  != null ? r.cpu_time_ns  : timeToNs(r.cpu_time,  r.time_unit || (data.time_unit || 'us'));
    if (!r.counters) r.counters = {};
    for (const k of Object.keys(r)) {
      if (/_per_second$/.test(k) && r[k] != null && r.counters[k] == null) {
        r.counters[k] = r[k];
      }
    }
  }

  return benchmarks;
}

export function load(data) {
  destroyAll();
  baseData = data;
  const benchmarks = normalizeBenchmarks(data);
  if (!benchmarks.length) {
    alert('No non-aggregate benchmark runs found in this file.');
    return;
  }

  const ctx = data.context || {};
  const baseTimestamp = data.timestamp || (ctx && ctx.date) || 'no timestamp';
  const comparedText = compareTimestamp ? ` vs ${compareTimestamp} (compared)` : '';
  document.getElementById('meta').innerHTML =
    `${esc(baseTimestamp)}${esc(comparedText)} · ${ctx.num_cpus || '?'} CPUs @ ${ctx.mhz_per_cpu || '?'} MHz`;

  const allNs   = benchmarks.map(r => r.real_time_ns);
  const fastest = benchmarks.reduce((a, b) => a.real_time_ns < b.real_time_ns ? a : b);
  const slowest = benchmarks.reduce((a, b) => a.real_time_ns > b.real_time_ns ? a : b);
  const groups  = groupByPrefix(benchmarks);

  document.getElementById('summary').innerHTML = `
    <div class="metric">
      <div class="metric-label">Benchmarks</div>
      <div class="metric-value">${benchmarks.length}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Groups</div>
      <div class="metric-value">${groups.size}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Fastest</div>
      <div class="metric-value">${fmtNs(Math.min(...allNs))}</div>
      <div class="metric-sub">${esc(fastest.name)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Slowest</div>
      <div class="metric-value">${fmtNs(Math.max(...allNs))}</div>
      <div class="metric-sub">${esc(slowest.name)}</div>
    </div>`;

  const tabBar   = document.getElementById('tabs');
  const panelsEl = document.getElementById('panels');
  tabBar.innerHTML   = '';
  panelsEl.innerHTML = '';

  let first = true;
  for (const [group, runs] of groups) {
    const btn = document.createElement('button');
    btn.textContent   = group;
    btn.dataset.group = group;
    if (first) btn.classList.add('active');
    tabBar.appendChild(btn);

    const compareRuns = compareByGroup.get(group) || [];
    const panel = buildPanel(group, runs, compareRuns);
    if (first) panel.classList.add('active');
    panelsEl.appendChild(panel);
    first = false;
  }

  tabBar.addEventListener('click', e => {
    const btn = e.target.closest('button[data-group]');
    if (!btn) return;
    tabBar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    panelsEl.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    panelsEl.querySelector(`.panel[data-group="${btn.dataset.group}"]`).classList.add('active');
  });

  document.getElementById('drop-zone').style.display = 'none';
  document.getElementById('content').style.display   = 'block';

  const compareBtn = document.getElementById('compare-btn');
  if (compareBtn) {
    compareBtn.disabled = false;
    setBenchmarkActionsVisible(true);
    if (compareByGroup && compareByGroup.size) {
      compareBtn.textContent = 'Clear compare';
      compareBtn.title = 'Clear loaded comparison';
    } else {
      compareBtn.textContent = 'Compare';
      compareBtn.title = 'Load compare benchmark JSON';
    }
  }
}

function readBenchmarkFile(file) {
  const r = new FileReader();
  r.onload = e => {
    try { load(JSON.parse(e.target.result)); }
    catch (err) { alert('Could not parse JSON: ' + err.message); }
  };
  r.readAsText(file);
}

function readCompareFile(file) {
  const r = new FileReader();
  r.onload = e => {
    try {
      if (!baseData) {
        alert('Load a base benchmark file first.');
        return;
      }
      const compareData = JSON.parse(e.target.result);
      const compareRuns = normalizeBenchmarks(compareData);
      if (!compareRuns.length) {
        alert('No non-aggregate benchmark runs found in compare file.');
        return;
      }

      const baseNames = new Set(normalizeBenchmarks(baseData).map(x => x.name));
      const sharedCount = compareRuns.reduce((c, r0) => c + (baseNames.has(r0.name) ? 1 : 0), 0);
      if (!sharedCount) {
        alert('Compare file does not share benchmark names with the loaded base file.');
        return;
      }

      compareByGroup = groupByPrefix(compareRuns);
      compareTimestamp = compareData.timestamp || (compareData.context && compareData.context.date) || 'no timestamp';
      load(baseData);

      const compareBtn = document.getElementById('compare-btn');
      if (compareBtn) {
        compareBtn.textContent = 'Clear compare';
        compareBtn.title = 'Clear loaded comparison';
      }
    }
    catch (err) {
      alert('Could not parse compare JSON: ' + err.message);
    }
  };
  r.readAsText(file);
}

// wire file input and drag/drop
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', e => { if (e.target.files[0]) readBenchmarkFile(e.target.files[0]); });
const dz = document.getElementById('drop-zone');
dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', ()  => dz.classList.remove('over'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files[0]) readBenchmarkFile(e.dataTransfer.files[0]); });
dz.addEventListener('click', e => { if (e.target.tagName !== 'BUTTON') fileInput.click(); });

const compareBtn = document.getElementById('compare-btn');
const compareFileInput = document.getElementById('compare-file-input');
if (compareBtn && compareFileInput) {
  compareBtn.addEventListener('click', () => {
    // if a compare is loaded, use this button to clear it; otherwise open file picker
    if (compareByGroup && compareByGroup.size) {
      compareByGroup = new Map();
      compareTimestamp = null;
      if (baseData) load(baseData);
      compareBtn.textContent = 'Compare';
      compareBtn.title = 'Load compare benchmark JSON';
    } else {
      compareFileInput.click();
    }
  });
  compareFileInput.addEventListener('change', e => {
    if (e.target.files[0]) readCompareFile(e.target.files[0]);
    compareFileInput.value = '';
  });
}

const newViewBtn = document.getElementById('new-view-btn');
if (newViewBtn) {
  newViewBtn.addEventListener('click', () => {
    resetViewer();
  });
}

// theme toggle
(function(){
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  function applyTheme(theme){
    const isLight = theme === 'light';
    document.body.classList.toggle('light', isLight);
    try{
      // recompute primary color
      updateChartColors();
      updateLegends();
    }catch(e){}
    btn.textContent = isLight ? '🌞 Light' : '🌙 Dark';
    btn.setAttribute('aria-pressed', String(isLight));
  }
  // Always start in light mode.
  applyTheme('light');
  btn.addEventListener('click', ()=>{
    const cur = document.body.classList.contains('light') ? 'light' : 'dark';
    const next = cur === 'light' ? 'dark' : 'light';
    applyTheme(next);
  });
})();

// expose for debugging
window._benchviewer = { load };

// auto-load a sample if provided via global `INITIAL_DATA`
if (window.INITIAL_DATA) load(window.INITIAL_DATA);
