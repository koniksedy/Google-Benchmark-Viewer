/*
 * viewer-ui.js
 * Render/reset logic for the benchmark viewer surface.
 */

import { destroyAll } from '../charts.js';
import { groupByPrefix } from '../utils/bench.js';
import { esc } from '../utils/html.js';
import { fmtNs } from '../utils/time.js';
import { buildPanel } from '../panels.js';
import { normalizeBenchmarks } from './benchmark-data.js';
import { clearCompare, resetState } from './state.js';

export function setBenchmarkActionsVisible(visible) {
    const display = visible ? '' : 'none';
    const newViewBtn = document.getElementById('new-view-btn');
    const compareBtn = document.getElementById('compare-btn');
    if (newViewBtn) newViewBtn.style.display = display;
    if (compareBtn) compareBtn.style.display = display;
}

/**
 * Reset both state and visible UI to the initial drop-zone screen.
 */
export function resetViewer(state) {
    destroyAll();
    resetState(state);

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
    const help = document.querySelector('.drop-help-panel');
    if (help) help.style.display = '';
    if (meta) meta.textContent = 'Drop a bench_results.json to begin.';

    if (compareBtn) {
        compareBtn.disabled = true;
        compareBtn.textContent = 'Compare';
        compareBtn.title = 'Load compare benchmark JSON';
    }

    if (fileInput) fileInput.value = '';
    if (compareFileInput) compareFileInput.value = '';
}

function renderSummary(benchmarks, groups) {
    const allNs = benchmarks.map(row => row.real_time_ns);
    const fastest = benchmarks.reduce((a, b) => (a.real_time_ns < b.real_time_ns ? a : b));
    const slowest = benchmarks.reduce((a, b) => (a.real_time_ns > b.real_time_ns ? a : b));

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
}

function renderMeta(data, state) {
    const ctx = data.context || {};
    const baseTimestamp = data.timestamp || (ctx && ctx.date) || 'no timestamp';
    const comparedText = state.compareTimestamp ? ` vs ${state.compareTimestamp} (compared)` : '';
    document.getElementById('meta').innerHTML =
        `${esc(baseTimestamp)}${esc(comparedText)} · ${ctx.num_cpus || '?'} CPUs @ ${ctx.mhz_per_cpu || '?'} MHz`;
}

function renderTabsAndPanels(groups, state) {
    const tabBar = document.getElementById('tabs');
    const panelsEl = document.getElementById('panels');
    tabBar.innerHTML = '';
    panelsEl.innerHTML = '';

    let first = true;
    for (const [group, runs] of groups) {
        const tabBtn = document.createElement('button');
        tabBtn.textContent = group;
        tabBtn.dataset.group = group;
        if (first) tabBtn.classList.add('active');
        tabBar.appendChild(tabBtn);

        const compareRuns = state.compareByGroup.get(group) || [];
        const panel = buildPanel(group, runs, compareRuns);
        if (first) panel.classList.add('active');
        panelsEl.appendChild(panel);
        first = false;
    }

    // Replace the previous tab click handler entirely to avoid duplicate listeners.
    tabBar.onclick = e => {
        const btn = e.target.closest('button[data-group]');
        if (!btn) return;

        tabBar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        panelsEl.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const target = panelsEl.querySelector(`.panel[data-group="${btn.dataset.group}"]`);
        if (target) target.classList.add('active');
    };
}

function updateCompareButton(state) {
    const compareBtn = document.getElementById('compare-btn');
    if (!compareBtn) return;

    compareBtn.disabled = false;
    setBenchmarkActionsVisible(true);
    if (state.compareByGroup && state.compareByGroup.size) {
        compareBtn.textContent = 'Clear compare';
        compareBtn.title = 'Clear loaded comparison';
    } else {
        compareBtn.textContent = 'Compare';
        compareBtn.title = 'Load compare benchmark JSON';
    }
}

/**
 * Render the loaded benchmark JSON into tabs, charts and raw tables.
 */
export function loadIntoViewer(data, state) {
    destroyAll();
    state.baseData = data;

    const benchmarks = normalizeBenchmarks(data);
    if (!benchmarks.length) {
        alert('No non-aggregate benchmark runs found in this file.');
        return;
    }

    const groups = groupByPrefix(benchmarks);
    renderMeta(data, state);
    renderSummary(benchmarks, groups);
    renderTabsAndPanels(groups, state);

    const dropZoneEl = document.getElementById('drop-zone');
    if (dropZoneEl) dropZoneEl.style.display = 'none';
    const help = document.querySelector('.drop-help-panel');
    if (help) help.style.display = 'none';
    const contentEl = document.getElementById('content');
    if (contentEl) contentEl.style.display = 'block';
    updateCompareButton(state);
}

export function clearCompareAndReload(state) {
    clearCompare(state);
    if (state.baseData) loadIntoViewer(state.baseData, state);
}
