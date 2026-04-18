/*
 * rawTable.js
 * Build grouped/flat raw benchmark tables for a panel.
 */

import { esc } from '../utils/html.js';
import { fmtNs } from '../utils/time.js';
import { fmtCount } from '../utils/number.js';
import { parseName } from '../utils/bench.js';

export function buildTable(runs, opts = {}) {
    if (!runs.length) {
        const empty = document.createElement('div');
        empty.className = 'table-wrap';
        empty.innerHTML = '<p style="padding:12px 16px;color:var(--muted)">No rows for current selection.</p>';
        return empty;
    }

    // The X axis segment should not split raw-data tree branches.
    const xSource = opts.xSource || null;
    const roles = Array.isArray(opts.roles) ? opts.roles : null;
    const xIdxFromRoles = roles ? roles.findIndex(r => r === 'x') : -1;
    const xIdxFromSource = xSource && xSource.startsWith('seg:') ? Number(xSource.slice(4)) : -1;
    const skipSegIdx = xIdxFromRoles >= 0 ? xIdxFromRoles : (xIdxFromSource >= 0 ? xIdxFromSource : null);
    const metricKey = opts.metric || 'cpu_time_ns';
    const compareByName = opts.compareByName instanceof Map ? opts.compareByName : new Map();

    // Delta is base - compare: negative is better (faster base), positive is worse.
    function deltaClass(deltaNs) {
        if (deltaNs == null) return '';
        if (deltaNs < 0) return 'delta-better';
        if (deltaNs > 0) return 'delta-worse';
        return 'delta-same';
    }

    function deltaTag(baseNs, compareNs) {
        if (baseNs == null || compareNs == null || isNaN(baseNs) || isNaN(compareNs)) return '';
        const delta = Number(baseNs) - Number(compareNs);
        const sign = delta < 0 ? '-' : (delta > 0 ? '+' : '\u00b1');
        return `<span class="time-delta ${deltaClass(delta)}">${sign}${fmtNs(Math.abs(delta))}</span>`;
    }

    function timeCell(baseNs, compareNs) {
        return `<span class="time-main">${fmtNs(baseNs)}</span>${deltaTag(baseNs, compareNs)}`;
    }

    const root = { children: new Map(), runs: [] };
    for (const run of runs) {
        const parsed = parseName(run.name || '');
        const segs = parsed.segments || [];
        const parts = [parsed.group];

        for (let i = 0; i < segs.length; i += 1) {
            if (skipSegIdx != null && i === skipSegIdx) continue;
            if (segs[i] == null || segs[i] === '') continue;
            parts.push(String(segs[i]));
        }

        let node = root;
        for (let i = 0; i < parts.length; i += 1) {
            const part = parts[i];
            if (!node.children.has(part)) node.children.set(part, { children: new Map(), runs: [] });
            node = node.children.get(part);
        }
        node.runs.push(run);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'raw-groups';

    const head = document.createElement('div');
    head.className = 'raw-groups-head';

    const title = document.createElement('div');
    title.className = 'table-section-title';
    title.textContent = 'Raw data';

    const toggleAll = document.createElement('button');
    toggleAll.type = 'button';
    toggleAll.className = 'raw-toggle-all';
    toggleAll.textContent = 'Show all';
    toggleAll.title = 'Expand or collapse all grouped raw-data nodes';

    const rawToggle = document.createElement('button');
    rawToggle.type = 'button';
    rawToggle.className = 'raw-toggle-all';
    rawToggle.textContent = 'Show raw';
    rawToggle.title = 'Switch between grouped view and flat raw rows';

    const controls = document.createElement('div');
    controls.className = 'raw-group-controls';
    controls.appendChild(toggleAll);
    controls.appendChild(rawToggle);
    head.appendChild(title);
    head.appendChild(controls);
    wrapper.appendChild(head);

    const list = document.createElement('div');
    list.className = 'raw-group-list';
    wrapper.appendChild(list);

    function renderRows(rows) {
        const rowHtml = rows.map(run => {
            const cmp = compareByName.get(run.name);
            return `<tr>
        <td class="td-mono" title="${esc(run.name)}">${esc(run.name)}</td>
        <td class="td-right">${timeCell(run.real_time_ns, cmp && cmp.real_time_ns)}</td>
        <td class="td-right">${timeCell(run.cpu_time_ns, cmp && cmp.cpu_time_ns)}</td>
        <td class="td-right">${fmtCount(run.iterations)}</td>
      </tr>`;
        }).join('');

        return `<div class="table-wrap"><table>
      <thead><tr>
        <th>Name</th>
        <th style="text-align:right">Wall time</th>
        <th style="text-align:right">CPU time</th>
        <th style="text-align:right">Iterations</th>
      </tr></thead>
      <tbody>${rowHtml}</tbody>
    </table></div>`;
    }

    function subtreeStats(node) {
        const stats = { count: 0, baseNs: 0, compareNs: 0, compareCount: 0 };
        for (const run of node.runs) {
            stats.count += 1;
            stats.baseNs += Number(run[metricKey] || 0);
            const cmp = compareByName.get(run.name);
            if (cmp && cmp[metricKey] != null) {
                stats.compareNs += Number(cmp[metricKey] || 0);
                stats.compareCount += 1;
            }
        }

        node.children.forEach(child => {
            const childStats = subtreeStats(child);
            stats.count += childStats.count;
            stats.baseNs += childStats.baseNs;
            stats.compareNs += childStats.compareNs;
            stats.compareCount += childStats.compareCount;
        });

        return stats;
    }

    function renderNode(label, node) {
        const el = document.createElement('details');
        el.className = 'raw-group raw-tree-node';

        const stats = subtreeStats(node);
        const total = stats.count;
        const timeStr = stats.count ? fmtNs(stats.baseNs) : '\u2014';
        const cmpTotal = stats.compareCount === stats.count && stats.count > 0
            ? deltaTag(stats.baseNs, stats.compareNs)
            : '';

        el.innerHTML =
            `<summary>
        <span class="raw-group-name td-mono">${esc(label)}</span>
        <span class="raw-group-meta"><span class="raw-group-count">${total} run${total === 1 ? '' : 's'} · ${timeStr}</span>${cmpTotal}</span>
      </summary>`;

        const body = document.createElement('div');
        body.className = 'raw-tree-body';

        if (node.runs.length) {
            const leaf = document.createElement('div');
            leaf.className = 'raw-tree-leaf';
            leaf.innerHTML = renderRows(node.runs);
            body.appendChild(leaf);
        }

        const childNames = [...node.children.keys()].sort((a, b) => a.localeCompare(b));
        childNames.forEach(name => {
            body.appendChild(renderNode(name, node.children.get(name)));
        });

        el.appendChild(body);
        return el;
    }

    const top = [...root.children.keys()].sort((a, b) => a.localeCompare(b));
    top.forEach(name => list.appendChild(renderNode(name, root.children.get(name))));

    toggleAll.addEventListener('click', () => {
        const blocks = list.querySelectorAll('.raw-tree-node');
        const shouldOpen = toggleAll.textContent === 'Show all';
        blocks.forEach(d => { d.open = shouldOpen; });
        toggleAll.textContent = shouldOpen ? 'Collapse all' : 'Show all';
        toggleAll.title = shouldOpen
            ? 'Collapse all grouped raw-data nodes'
            : 'Expand all grouped raw-data nodes';
    });

    // Flat table shown by toggling away from the grouped tree.
    const flat = document.createElement('div');
    flat.style.display = 'none';
    flat.className = 'raw-flat';
    flat.innerHTML = renderRows(runs);
    wrapper.appendChild(flat);

    rawToggle.addEventListener('click', () => {
        const showing = rawToggle.textContent === 'Show raw';
        rawToggle.textContent = showing ? 'Show grouped' : 'Show raw';
        list.style.display = showing ? 'none' : '';
        flat.style.display = showing ? '' : 'none';
        toggleAll.disabled = showing;
        rawToggle.title = showing
            ? 'Switch back to grouped raw-data tree'
            : 'Switch to flat raw rows';
    });

    return wrapper;
}
