/*
 * panels.js
 * Build the UI panels for each benchmark group. This file focuses on
 * arranging charts + table views and exposes `buildPanel` which returns
 * a DOM node for a benchmark group.
 */
import { esc, bestUnit, toUnit, fmtNs, fmtCount, parseName, argDims, medianNs, parseNumericValue, fmtTickNumber } from './utils.js';
import { chartCard, mkChart, getColors } from './charts.js';

export function charts0d(group, runs) {
  // Single-dimension charts: bar chart per variant
  const unit = bestUnit(medianNs(runs));
  const labels = runs.map(r => r.name.replace(group + '/', '') || group);
  const ds = [{ label: 'CPU time', data: runs.map(r => toUnit(r.real_time_ns, unit)) }];
  const h = 320;
  const cards = [chartCard(group, `Time (${unit}) per variant`, h, canvas => {
    const ch = mkChart(canvas, 'bar', labels, ds, { yLabel: unit, yUnit: unit });
    return { datasets: ds, chart: ch };
  })];

  return cards;
}

export function charts1d(group, runs, dims) {
  const vdim = dims.find(d => d.length > 1) || dims[0];
  const unit  = bestUnit(medianNs(runs));

  const lookup = new Map(runs.map(r => {
    const { args } = parseName(r.name);
    const key = args.find((_, i) => dims[i] && dims[i].length > 1);
    return [key, r];
  }));

  const labels = vdim.map(String);
  const ds = [{ label: 'CPU time', data: vdim.map(v => {
    const r = lookup.get(v); return r ? toUnit(r.real_time_ns, unit) : null;
  })}];

  const h = 320;
  const cards = [chartCard(group, `Time (${unit})`, h, canvas => {
    const ch = mkChart(canvas, labels.length <= 10 ? 'line' : 'bar', labels, ds,
      { yLabel: unit, yUnit: unit });
    return { datasets: ds, chart: ch };
  })];

  return cards;
}

export function charts2d(group, runs, dims) {
  const vDims = dims.filter(d => d.length > 1);
  const [d0, d1] = vDims;
  const unit = bestUnit(medianNs(runs));

  const idxOf = (dimVals) => dims.findIndex(d => d === dimVals);
  const i0 = idxOf(d0), i1 = idxOf(d1);

  const lookup = new Map();
  for (const r of runs) {
    const { args } = parseName(r.name);
    lookup.set(`${args[i0]}|${args[i1]}`, r.real_time_ns);
  }

  const labels = d1.map(String);
  const ds = d0.map((v0, i) => ({
    label: String(v0),
    data: d1.map(v1 => {
      const ns = lookup.get(`${v0}|${v1}`);
      return ns != null ? toUnit(ns, unit) : null;
    })
  }));

  const cards = [chartCard(group, `Time (${unit}) — series = arg[${i0}], x = arg[${i1}]`, 320, canvas => {
    const ch = mkChart(canvas, 'line', labels, ds, { yLabel: unit, yUnit: unit });
    return { datasets: ds, chart: ch };
  })];

  return cards;
}

export function charts3d(group, runs, dims, panelEl) {
  const vDims = dims.filter(d => d.length > 1);
  const sliceDim = vDims[vDims.length - 1];
  const innerDims = vDims.slice(0, -1);
  const sliceIdx = dims.findIndex(d => d === sliceDim);

  const unit = bestUnit(medianNs(runs));

  const controls = document.createElement('div');
  controls.className = 'controls';
  controls.innerHTML = '<label>Fix arg[' + sliceIdx + ']:</label>';
  const sel = document.createElement('select');
  sliceDim.forEach(v => {
    const o = document.createElement('option'); o.value = v; o.textContent = String(v); sel.appendChild(o);
  });
  controls.appendChild(sel);
  panelEl.appendChild(controls);

  const grid = document.createElement('div');
  grid.className = 'chart-grid';
  panelEl.appendChild(grid);

  function render(slice) {
    grid.innerHTML = '';
    const sliceRuns = runs.filter(r => parseName(r.name).args[sliceIdx] == slice);
    const sliceDims = argDims(sliceRuns);
    const cards = innerDims.length >= 2
      ? charts2d(group, sliceRuns, sliceDims)
      : charts1d(group, sliceRuns, sliceDims);
    cards.forEach(c => grid.appendChild(c));
  }

  sel.addEventListener('change', () => render(sliceDim[sel.selectedIndex]));
  render(sliceDim[0]);
}

export function buildTable(runs, opts = {}) {
  if (!runs.length) {
    const empty = document.createElement('div');
    empty.className = 'table-wrap';
    empty.innerHTML = '<p style="padding:12px 16px;color:var(--muted)">No rows for current selection.</p>';
    return empty;
  }

  // options: opts.roles or opts.xSource indicate which segment is mapped
  // to the X axis. That segment is excluded from grouping keys so x values
  // do not create separate tree branches.
  const xSource = opts.xSource || null;
  const roles = Array.isArray(opts.roles) ? opts.roles : null;
  const xIdxFromRoles = roles ? roles.findIndex(r => r === 'x') : -1;
  const xIdxFromSource = xSource && xSource.startsWith('seg:') ? Number(xSource.slice(4)) : -1;
  const skipSegIdx = xIdxFromRoles >= 0 ? xIdxFromRoles : (xIdxFromSource >= 0 ? xIdxFromSource : null);
  const metricKey = opts.metric || 'cpu_time_ns';
  const compareByName = opts.compareByName instanceof Map ? opts.compareByName : new Map();

  // delta is computed as base - compare so negative values mean the
  // base run is faster (we show a negative speedup), positive means
  // the base run is slower than the comparison.
  function deltaClass(deltaNs) {
    if (deltaNs == null) return '';
    if (deltaNs < 0) return 'delta-better';
    if (deltaNs > 0) return 'delta-worse';
    return 'delta-same';
  }

  function deltaTag(baseNs, compareNs) {
    if (baseNs == null || compareNs == null || isNaN(baseNs) || isNaN(compareNs)) return '';
    // compute base - compare so negative indicates base is faster
    const delta = Number(baseNs) - Number(compareNs);
    const sign = delta < 0 ? '-' : (delta > 0 ? '+' : '±');
    return `<span class="time-delta ${deltaClass(delta)}">${sign}${fmtNs(Math.abs(delta))}</span>`;
  }

  function timeCell(baseNs, compareNs) {
    return `<span class="time-main">${fmtNs(baseNs)}</span>${deltaTag(baseNs, compareNs)}`;
  }

  const root = { children: new Map(), runs: [] };
  for (const r of runs) {
    const p = parseName(r.name || '');
    const segs = p.segments || [];
    const parts = [p.group];
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
    node.runs.push(r);
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
    const rowHtml = rows.map(r => {
      const cmp = compareByName.get(r.name);
      return `<tr>
        <td class="td-mono" title="${esc(r.name)}">${esc(r.name)}</td>
        <td class="td-right">${timeCell(r.real_time_ns, cmp && cmp.real_time_ns)}</td>
        <td class="td-right">${timeCell(r.cpu_time_ns, cmp && cmp.cpu_time_ns)}</td>
        <td class="td-right">${fmtCount(r.iterations)}</td>
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
    for (const r of node.runs) {
      stats.count += 1;
      stats.baseNs += Number(r[metricKey] || 0);
      const cmp = compareByName.get(r.name);
      if (cmp && cmp[metricKey] != null) {
        stats.compareNs += Number(cmp[metricKey] || 0);
        stats.compareCount += 1;
      }
    }
    node.children.forEach(ch => {
      const childStats = subtreeStats(ch);
      stats.count += childStats.count;
      stats.baseNs += childStats.baseNs;
      stats.compareNs += childStats.compareNs;
      stats.compareCount += childStats.compareCount;
    });
    return stats;
  }

  function renderNode(label, node, depth) {
    const el = document.createElement('details');
    el.className = 'raw-group raw-tree-node';

    const stats = subtreeStats(node);
    const total = stats.count;
    const timeStr = stats.count ? fmtNs(stats.baseNs) : '—';
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
      body.appendChild(renderNode(name, node.children.get(name), depth + 1));
    });

    el.appendChild(body);
    return el;
  }

  const top = [...root.children.keys()].sort((a, b) => a.localeCompare(b));
  top.forEach(name => list.appendChild(renderNode(name, root.children.get(name), 0)));

  toggleAll.addEventListener('click', () => {
    const blocks = list.querySelectorAll('.raw-tree-node');
    const shouldOpen = toggleAll.textContent === 'Show all';
    blocks.forEach(d => { d.open = shouldOpen; });
    toggleAll.textContent = shouldOpen ? 'Collapse all' : 'Show all';
    toggleAll.title = shouldOpen
      ? 'Collapse all grouped raw-data nodes'
      : 'Expand all grouped raw-data nodes';
  });

  // flat raw table element (ungrouped)
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

export function buildPanel(group, runs, compareRuns = []) {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.dataset.group = group;

  const parsed = runs.map(r => ({ run: r, p: parseName(r.name) }));
  const maxSegments = parsed.reduce((m, x) => Math.max(m, (x.p.segments || []).length), 0);
  const maxArgs = parsed.reduce((m, x) => Math.max(m, (x.p.args || []).length), 0);
  const leadingTextDepth = parsed.reduce((m, x) => {
    const segs = x.p.segments || [];
    let d = 0;
    while (d < segs.length && segs[d] !== '' && isNaN(Number(segs[d]))) d += 1;
    return Math.max(m, d);
  }, 0);

  const state = {
    metric: 'cpu_time_ns',
    depth: leadingTextDepth,
    subtypeDefs: Array.from({ length: leadingTextDepth }, (_, i) => ({ idx: i, level: i + 1 })),
    xSource: 'auto',
    seriesSource: 'auto',
    graphType: 'line',
    logX: false,
    logY: false,
    focus: { xMin: '', xMax: '', yMin: '', yMax: '' },
    overrides: new Map(),
    seriesColorMap: new Map(),
    nextSeriesColorIdx: 0,
    scatterPair: null,
    scatterPairPrompting: false,
    hiddenLegendByGraph: new Map(),
  };

  try {
    const sk = `bench_viewer_overrides:${group}`;
    const raw = localStorage.getItem(sk);
    if (raw) {
      const obj = JSON.parse(raw);
      state.overrides = new Map(Object.entries(obj));
    }
  } catch (e) { /* ignore parse/localStorage errors */ }

  const segmentValues = Array.from({ length: maxSegments }, () => new Set());
  parsed.forEach(({ p }) => {
    const segs = p.segments || [];
    for (let i = 0; i < maxSegments; i += 1) {
      if (segs[i] != null) segmentValues[i].add(String(segs[i]));
    }
  });

  const sampleSegments = parsed
    .slice()
    .sort((a, b) => (b.p.segments || []).length - (a.p.segments || []).length)[0]?.p.segments || [];

  const mappingControls = document.createElement('div');
  mappingControls.className = 'mapping-studio';
  const content = document.createElement('div');
  panel.appendChild(mappingControls);
  panel.appendChild(content);

  const studioHead = document.createElement('div');
  studioHead.className = 'mapping-head';
  studioHead.innerHTML =
    `<div class="mapping-head-main">` +
    `<div class="mapping-title">Name Mapping Studio</div>` +
    `<div class="mapping-sub">Click each token and assign role.</div>` +
    `</div>`;
  mappingControls.appendChild(studioHead);

  const headTools = document.createElement('div');
  headTools.className = 'mapping-head-tools';
  studioHead.appendChild(headTools);

  const metricWrap = document.createElement('label');
  metricWrap.className = 'mapping-ydata';
  metricWrap.innerHTML = '<span>Y data</span>';
  const metricSel = document.createElement('select');
  [
    { value: 'real_time_ns', text: 'Wall time' },
    { value: 'cpu_time_ns', text: 'CPU time' },
  ].forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.text;
    metricSel.appendChild(opt);
  });
  metricSel.value = state.metric;
  metricSel.title = 'Choose the metric used on chart Y axis and summaries';
  metricWrap.appendChild(metricSel);
  headTools.appendChild(metricWrap);

  const roleLegend = document.createElement('div');
  roleLegend.className = 'mapping-role-legend';
  roleLegend.innerHTML =
    '<span class="role-pill role-subtype">Subtype N</span>' +
    '<span class="role-pill role-series">Series</span>' +
    '<span class="role-pill role-x">X axis</span>';
  mappingControls.appendChild(roleLegend);

  const sampleEl = document.createElement('div');
  sampleEl.className = 'mapping-example';
  sampleEl.textContent = sampleSegments.length ? `${group}/${sampleSegments.join('/')}` : group;
  mappingControls.appendChild(sampleEl);

  const examplePicker = document.createElement('div');
  examplePicker.className = 'mapping-example-picker';
  mappingControls.appendChild(examplePicker);

  const actionRow = document.createElement('div');
  actionRow.className = 'mapping-actions';
  headTools.appendChild(actionRow);

  const resetRolesBtn = document.createElement('button');
  resetRolesBtn.type = 'button';
  resetRolesBtn.className = 'file-btn';
  resetRolesBtn.textContent = 'Reset mapping';
  resetRolesBtn.title = 'Reset token role mapping to automatic defaults';
  actionRow.appendChild(resetRolesBtn);

  const editLabelsBtn = document.createElement('button');
  editLabelsBtn.type = 'button';
  editLabelsBtn.className = 'file-btn';
  editLabelsBtn.textContent = 'Edit labels';
  editLabelsBtn.title = 'Edit displayed labels for X and series values';
  actionRow.appendChild(editLabelsBtn);

  let roleAssignments = Array.from({ length: maxSegments }, (_, i) => `subtype${i + 1}`);
  state.subtypeSelections = {};

  function roleClass(role) {
    if (role && role.startsWith('subtype')) return 'role-subtype';
    if (role === 'series') return 'role-series';
    if (role === 'x') return 'role-x';
    return 'role-subtype';
  }

  function roleBadge(role) {
    if (!role || !role.startsWith('subtype')) return '';
    const m = role.match(/^subtype(\d+)$/);
    return m ? `S${m[1]}` : 'S';
  }

  function closeRolePopover() {
    document.querySelectorAll('.mapping-role-pop').forEach(el => el.remove());
  }

  function normalizeRoles(roles) {
    const inRoles = Array.from({ length: maxSegments }, (_, i) => roles[i] || `subtype${i + 1}`);
    let xIdx = inRoles.findIndex(r => r === 'x');
    let seriesIdx = inRoles.findIndex((r, i) => r === 'series' && i !== xIdx);
    if (seriesIdx === xIdx) seriesIdx = -1;

    const out = Array.from({ length: maxSegments }, () => '');
    if (xIdx >= 0) out[xIdx] = 'x';
    if (seriesIdx >= 0) out[seriesIdx] = 'series';

    const subtypeCandidates = [];
    for (let i = 0; i < maxSegments; i += 1) {
      if (out[i]) continue;
      const m = String(inRoles[i]).match(/^subtype(\d+)$/);
      subtypeCandidates.push({ i, lvl: m ? Number(m[1]) : Number.POSITIVE_INFINITY });
    }
    subtypeCandidates.sort((a, b) => a.lvl === b.lvl ? a.i - b.i : a.lvl - b.lvl);
    subtypeCandidates.forEach((c, idx) => { out[c.i] = `subtype${idx + 1}`; });
    return out;
  }

  function setRoleAssignments(roles) {
    roleAssignments = normalizeRoles([...roles]);
    syncExampleTokenStyles();
  }

  function syncExampleTokenStyles() {
    const toks = examplePicker.querySelectorAll('.example-token-btn');
    toks.forEach((tok, i) => {
      const role = roleAssignments[i] || `subtype${i + 1}`;
      tok.classList.remove('role-subtype', 'role-series', 'role-x', 'role-ignore');
      tok.classList.add(roleClass(role));
      const badge = roleBadge(role);
      if (badge) tok.setAttribute('data-role-label', badge);
      else tok.removeAttribute('data-role-label');
    });
  }

  function roleOptions() {
    const opts = [];
    for (let i = 1; i <= Math.max(1, maxSegments); i += 1) {
      opts.push([`subtype${i}`, `Subtype ${i}`]);
    }
    opts.push(['series', 'Series']);
    opts.push(['x', 'X axis']);
    return opts;
  }

  function openRolePopover(idx, anchor) {
    closeRolePopover();
    const pop = document.createElement('div');
    pop.className = 'mapping-role-pop';
    const current = roleAssignments[idx] || `subtype${idx + 1}`;

    roleOptions().forEach(([value, text]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `mapping-role-pop-btn ${roleClass(value)}` + (value === current ? ' active' : '');
      b.textContent = text;
      b.title = `Assign token as ${text}`;
      b.addEventListener('click', () => {
        const next = [...roleAssignments];
        const current = next[idx];
        // If the chosen value is already assigned to another token, swap roles
        if (value !== current) {
          const otherIdx = next.findIndex(r => r === value);
          if (otherIdx !== -1) {
            // swap the roles between otherIdx and idx
            next[otherIdx] = current;
          }
        }
        next[idx] = value;
        applyRolesToState(next);
        closeRolePopover();
      });
      pop.appendChild(b);
    });

    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${r.left + window.scrollX}px`;
    pop.style.top = `${r.bottom + window.scrollY + 6}px`;

    const onDocClick = e => {
      if (!pop.contains(e.target) && e.target !== anchor) {
        pop.remove();
        document.removeEventListener('mousedown', onDocClick);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', onDocClick), 0);
  }

  function renderExamplePicker() {
    examplePicker.innerHTML = '';
    const prefix = document.createElement('span');
    prefix.className = 'example-prefix';
    prefix.textContent = group;
    examplePicker.appendChild(prefix);

    if (!maxSegments) return;
    for (let i = 0; i < maxSegments; i += 1) {
      const sep = document.createElement('span');
      sep.className = 'example-sep';
      sep.textContent = '/';
      examplePicker.appendChild(sep);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'example-token-btn role-subtype';
      btn.textContent = sampleSegments[i] != null && sampleSegments[i] !== '' ? sampleSegments[i] : `seg[${i}]`;
      btn.title = 'Click to assign role';
      btn.addEventListener('click', () => openRolePopover(i, btn));
      examplePicker.appendChild(btn);
    }
    syncExampleTokenStyles();
  }

  function buildAutoRoles() {
    const roles = Array.from({ length: maxSegments }, (_, i) => `subtype${i + 1}`);

    const varying = [];
    for (let i = 0; i < maxSegments; i += 1) {
      const vals = [...segmentValues[i]].filter(v => v !== '');
      if (vals.length > 1) {
        varying.push({
          idx: i,
          allNumeric: vals.every(v => !isNaN(Number(v))),
        });
      }
    }

    if (!varying.length) return normalizeRoles(roles);

    let xIdx = -1;
    for (let i = varying.length - 1; i >= 0; i -= 1) {
      if (varying[i].allNumeric) {
        xIdx = varying[i].idx;
        break;
      }
    }
    if (xIdx < 0) xIdx = varying[varying.length - 1].idx;

    const pre = varying.filter(v => v.idx !== xIdx).map(v => v.idx);
    let seriesIdx = -1;
    if (pre.length) seriesIdx = pre[pre.length - 1];

    const subtypeIdxs = pre.slice(0, -1).sort((a, b) => a - b);
    subtypeIdxs.forEach((idx, n) => {
      roles[idx] = `subtype${n + 1}`;
    });

    if (seriesIdx >= 0) roles[seriesIdx] = 'series';
    if (xIdx >= 0) roles[xIdx] = 'x';
    return normalizeRoles(roles);
  }

  function rolesFromState() {
    const roles = Array.from({ length: maxSegments }, (_, i) => `subtype${i + 1}`);
    state.subtypeDefs.forEach(({ idx, level }) => {
      if (idx >= 0 && idx < maxSegments) roles[idx] = `subtype${level}`;
    });
    if (state.seriesSource.startsWith('seg:')) {
      const i = Number(state.seriesSource.slice(4));
      if (!isNaN(i) && i >= 0 && i < maxSegments) roles[i] = 'series';
    }
    if (state.xSource.startsWith('seg:')) {
      const i = Number(state.xSource.slice(4));
      if (!isNaN(i) && i >= 0 && i < maxSegments) roles[i] = 'x';
    }
    return normalizeRoles(roles);
  }

  function applyRolesToState(roles) {
    const normalized = normalizeRoles(roles);
    let xIdx = -1;
    let seriesIdx = -1;
    const subtypeDefs = [];

    normalized.forEach((r, i) => {
      if (r === 'x') xIdx = i;
      else if (r === 'series') seriesIdx = i;
      else {
        const m = r.match(/^subtype(\d+)$/);
        if (m) subtypeDefs.push({ idx: i, level: Number(m[1]) });
      }
    });

    subtypeDefs.sort((a, b) => a.level - b.level);
    state.subtypeDefs = subtypeDefs;
    state.depth = subtypeDefs.length;
    state.xSource = xIdx >= 0 ? `seg:${xIdx}` : 'auto';
    state.seriesSource = seriesIdx >= 0 ? `seg:${seriesIdx}` : 'none';
    state.subtypeSelections = {};

    setRoleAssignments(normalized);
    render();
  }

  resetRolesBtn.addEventListener('click', () => applyRolesToState(buildAutoRoles()));

  function inferSources(runsSubset, depth) {
    const rows = runsSubset.map(r => parseName(r.name));
    const tails = rows.map(p => (p.segments || []).slice(depth));
    const hasTail = tails.some(t => t.length > 0);
    if (hasTail) {
      const prevVals = tails.map(t => t.length >= 2 ? String(t[t.length - 2]) : '').filter(v => v !== '');
      const uniquePrev = new Set(prevVals);
      return {
        xSource: 'tail:last',
        seriesSource: uniquePrev.size > 1 ? 'tail:prev' : 'none'
      };
    }

    const varying = [];
    for (let i = 0; i < maxArgs; i += 1) {
      const vals = new Set(rows.map(p => p.args[i]));
      if (vals.size > 1) varying.push(i);
    }
    if (varying.length >= 2) return { xSource: `arg:${varying[1]}`, seriesSource: `arg:${varying[0]}` };
    if (varying.length === 1) return { xSource: `arg:${varying[0]}`, seriesSource: 'none' };
    return { xSource: 'name', seriesSource: 'none' };
  }

  function valueForSource(run, source, depth) {
    const p = parseName(run.name);
    const segs = p.segments || [];
    const tail = segs.slice(depth);
    if (source === 'name') return run.name.replace(group + '/', '') || group;
    if (source === 'tail:last') return tail.length ? tail[tail.length - 1] : null;
    if (source === 'tail:prev') return tail.length >= 2 ? tail[tail.length - 2] : null;
    if (source.startsWith('seg:')) {
      const i = Number(source.slice(4));
      return isNaN(i) ? null : (segs[i] ?? null);
    }
    if (source.startsWith('arg:')) {
      const i = Number(source.slice(4));
      return isNaN(i) ? null : (p.args[i] ?? null);
    }
    return null;
  }

  function sortLabels(values) {
    const uniq = [...new Set(values.map(v => String(v)))];
    const allNumeric = uniq.every(v => !isNaN(Number(v)));
    return allNumeric
      ? uniq.sort((a, b) => Number(a) - Number(b))
      : uniq.sort((a, b) => a.localeCompare(b));
  }

  function colorForSeries(label) {
    const key = String(label);
    if (state.seriesColorMap.has(key)) return state.seriesColorMap.get(key);
    const palette = getColors();
    const col = palette[state.nextSeriesColorIdx % palette.length];
    state.nextSeriesColorIdx += 1;
    state.seriesColorMap.set(key, col);
    return col;
  }

  function axisInfoFromSource(runsSubset, source, depth) {
    const rawValues = runsSubset.map(r => valueForSource(r, source, depth)).filter(v => v != null && v !== '');
    const numericValues = rawValues.map(parseNumericValue).filter(v => v != null);
    const isNumeric = rawValues.length > 0 && numericValues.length === rawValues.length;
    return {
      isNumeric,
      hasPositiveValues: isNumeric && numericValues.every(v => v > 0),
      numericValues,
    };
  }

  function openScatterPairPrompt(seriesOptions, opts = {}) {
    if (state.scatterPairPrompting) return;
    state.scatterPairPrompting = true;

    const normalizedOptions = [];
    const seenSeriesValues = new Set();
    (Array.isArray(seriesOptions) ? seriesOptions : []).forEach(opt => {
      const valueRaw = (opt && typeof opt === 'object' && 'value' in opt) ? opt.value : opt;
      const value = valueRaw == null ? '' : String(valueRaw);
      if (seenSeriesValues.has(value)) return;
      seenSeriesValues.add(value);

      const labelRaw = (opt && typeof opt === 'object' && 'label' in opt)
        ? opt.label
        : value;
      const label = (labelRaw == null || String(labelRaw) === '') ? '(none)' : String(labelRaw);
      normalizedOptions.push({ value, label });
    });
    const seriesVals = normalizedOptions.map(o => o.value);

    const onApply = typeof opts.onApply === 'function' ? opts.onApply : null;
    const onCancel = typeof opts.onCancel === 'function' ? opts.onCancel : null;

    const overlay = document.createElement('div');
    overlay.className = 'scatter-pair-overlay';

    const box = document.createElement('div');
    box.className = 'scatter-pair-dialog';
    box.innerHTML = '<h3>Select two labels for the scatter plot</h3>';

    const desc = document.createElement('p');
    desc.className = 'scatter-pair-desc';
    desc.textContent = 'Pick the two series labels to compare on the X and Y axes.';
    box.appendChild(desc);

    const row = document.createElement('div');
    row.className = 'scatter-pair-fields';

    const makeField = (labelText, value) => {
      const wrap = document.createElement('label');
      wrap.className = 'scatter-pair-field';
      const span = document.createElement('span');
      span.textContent = labelText;
      const sel = document.createElement('select');
      normalizedOptions.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        sel.appendChild(opt);
      });
      sel.value = value;
      wrap.appendChild(span);
      wrap.appendChild(sel);
      return { wrap, sel };
    };

    const initialPair = Array.isArray(state.scatterPair) && state.scatterPair.length === 2
      ? state.scatterPair
      : [seriesVals[0], seriesVals[1]];
    const xField = makeField('X label', initialPair[0]);
    const yField = makeField('Y label', initialPair[1]);
    row.appendChild(xField.wrap);
    row.appendChild(yField.wrap);
    box.appendChild(row);

    const actions = document.createElement('div');
    actions.className = 'scatter-pair-actions';
    const err = document.createElement('div');
    err.className = 'mapping-sub';
    err.style.marginTop = '2px';
    err.style.marginBottom = '6px';
    err.style.color = 'var(--delta-worse-color)';
    err.style.display = 'none';
    err.textContent = 'Select two different labels for X and Y.';
    box.appendChild(err);
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'file-btn';
    apply.textContent = 'Apply';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'file-btn';
    cancel.textContent = 'Cancel';
    actions.appendChild(apply);
    actions.appendChild(cancel);
    box.appendChild(actions);

    function close(setPair = false) {
      state.scatterPairPrompting = false;
      try { overlay.remove(); } catch (e) {}
      if (!setPair && state.graphType === 'scatter' && seriesVals.length >= 2) {
        state.graphType = 'line';
      }
    }

    apply.addEventListener('click', () => {
      const x = xField.sel.value;
      const y = yField.sel.value;
      if (x === y) {
        err.style.display = 'block';
        return;
      }
      err.style.display = 'none';
      state.scatterPair = [x, y];
      close(true);
      if (onApply) {
        onApply([x, y]);
      } else {
        render();
      }
    });

    cancel.addEventListener('click', () => {
      close(false);
      if (onCancel) {
        onCancel();
      } else {
        render();
      }
    });

    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        close(false);
        if (onCancel) {
          onCancel();
        } else {
          render();
        }
      }
    });

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function buildChartGrid(titleSuffix, runsSubset, compareRunsSubset) {
    if (!runsSubset.length && !(compareRunsSubset && compareRunsSubset.length)) return null;
    const inferred = inferSources(runsSubset, state.depth);
    const xSource = state.xSource === 'auto' ? inferred.xSource : state.xSource;
    const seriesSource = state.seriesSource === 'auto' ? inferred.seriesSource : state.seriesSource;
    const metricLabel = state.metric === 'cpu_time_ns' ? 'CPU time' : 'Wall time';

    function applyOverride(source, raw) {
      if (raw == null) return raw;
      const key = `${source}::${String(raw)}`;
      return state.overrides.has(key) ? state.overrides.get(key) : raw;
    }

    const points = runsSubset.map(r => {
      const rawX = valueForSource(r, xSource, state.depth);
      const rawS = seriesSource === 'none' ? '' : valueForSource(r, seriesSource, state.depth);
      const xKey = rawX == null ? null : String(rawX);
      const xDisplay = applyOverride(xSource, xKey);
      const sRaw = rawS == null ? '' : String(rawS);
      const sKey = seriesSource === 'none' ? '' : (sRaw === '' ? '(none)' : sRaw);
      const sDisplayRaw = seriesSource === 'none' ? '' : applyOverride(seriesSource, sRaw);
      const sDisplay = seriesSource === 'none'
        ? ''
        : (sDisplayRaw == null || sDisplayRaw === '' ? '(none)' : String(sDisplayRaw));
      return {
        xKey,
        xDisplay: xDisplay == null ? xKey : String(xDisplay),
        sKey,
        sDisplay,
        y: r[state.metric],
      };
    }).filter(p => p.xKey != null && p.xKey !== '' && p.y != null);

    const comparePoints = (compareRunsSubset || []).map(r => {
      const rawX = valueForSource(r, xSource, state.depth);
      const rawS = seriesSource === 'none' ? '' : valueForSource(r, seriesSource, state.depth);
      const xKey = rawX == null ? null : String(rawX);
      const xDisplay = applyOverride(xSource, xKey);
      const sRaw = rawS == null ? '' : String(rawS);
      const sKey = seriesSource === 'none' ? '' : (sRaw === '' ? '(none)' : sRaw);
      const sDisplayRaw = seriesSource === 'none' ? '' : applyOverride(seriesSource, sRaw);
      const sDisplay = seriesSource === 'none'
        ? ''
        : (sDisplayRaw == null || sDisplayRaw === '' ? '(none)' : String(sDisplayRaw));
      return {
        xKey,
        xDisplay: xDisplay == null ? xKey : String(xDisplay),
        sKey,
        sDisplay,
        y: r[state.metric],
      };
    }).filter(p => p.xKey != null && p.xKey !== '' && p.y != null);

    if (!points.length && !comparePoints.length) return null;

    const xKeys = sortLabels([...points.map(p => p.xKey), ...comparePoints.map(p => p.xKey)]);
    const xLabelMap = new Map();
    [...points, ...comparePoints].forEach(p => {
      if (!xLabelMap.has(p.xKey)) xLabelMap.set(p.xKey, p.xDisplay);
    });
    const labels = xKeys.map(xk => xLabelMap.get(xk) ?? xk);

    const seriesKeys = seriesSource === 'none'
      ? ['']
      : sortLabels([
        ...points.map(p => p.sKey),
        ...comparePoints.map(p => p.sKey),
      ]);
    const baseSeriesKeys = seriesSource === 'none'
      ? ['']
      : sortLabels([...new Set(points.map(p => p.sKey))]);
    const compareSeriesKeys = seriesSource === 'none'
      ? (comparePoints.length ? [''] : [])
      : sortLabels([...new Set(comparePoints.map(p => p.sKey))]);
    const seriesLabelMap = new Map();
    [...points, ...comparePoints].forEach(p => {
      if (!seriesLabelMap.has(p.sKey)) seriesLabelMap.set(p.sKey, p.sDisplay);
    });

    const yVals = [...points.map(p => p.y), ...comparePoints.map(p => p.y)].sort((a, b) => a - b);
    const median = yVals[Math.floor(yVals.length / 2)] || 0;
    const unit = bestUnit(median);

    const lookup = new Map();
    for (const p of points) {
      lookup.set(`${p.sKey}|${p.xKey}`, p.y);
    }

    const compareLookup = new Map();
    for (const p of comparePoints) {
      compareLookup.set(`${p.sKey}|${p.xKey}`, p.y);
    }

    const xInfo = axisInfoFromSource(runsSubset, xSource, state.depth);
    const xIsNumeric = xInfo.isNumeric;
    const xCanLog = xInfo.hasPositiveValues;
    const xNumericValues = xKeys.map(k => parseNumericValue(k));

    function focusValue(raw) {
      if (raw === '' || raw == null) return null;
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    }

    const focus = {
      xMin: focusValue(state.focus.xMin),
      xMax: focusValue(state.focus.xMax),
      yMin: focusValue(state.focus.yMin),
      yMax: focusValue(state.focus.yMax),
    };

    const title = group + (titleSuffix ? ' / ' + titleSuffix : '');
    const grid = document.createElement('div');
    grid.className = 'chart-grid';

    const requestedGraphType = state.graphType || 'line';
    const visibilityKey = [requestedGraphType, titleSuffix || '', xSource, seriesSource].join('|');
    const hiddenLegend = state.hiddenLegendByGraph.get(visibilityKey) || new Set();
    const graphLabel =
      requestedGraphType === 'histogram' ? 'Histogram'
      : requestedGraphType === 'scatter' ? 'Scatter'
      : requestedGraphType === 'cactus' ? 'Cactus (cumulative)'
      : 'Line';

    grid.appendChild(chartCard(title, `${metricLabel} (${unit}) — ${graphLabel}`, 320, canvas => {
      function buildLineOrHistogramDatasets(asLine) {
        const datasets = [];
        const numericX = xIsNumeric ? xNumericValues : null;
        const usePointObjects = asLine && xIsNumeric;
        const hasRealPoint = arr => arr.some(v => {
          if (v == null) return false;
          if (typeof v === 'object') return v.y != null && Number.isFinite(Number(v.y));
          return Number.isFinite(Number(v));
        });
        for (let i = 0; i < seriesKeys.length; i += 1) {
          const sk = seriesKeys[i];
          const baseLabel = sk === '' ? metricLabel : (seriesLabelMap.get(sk) ?? sk);
          const compLabel = baseLabel + ' (compare)';

          const baseData = xKeys.map((xk, idx) => {
            const ns = lookup.get(`${sk}|${xk}`);
            if (ns == null) return usePointObjects ? { x: numericX[idx], y: null } : null;
            const y = toUnit(ns, unit);
            return usePointObjects ? { x: numericX[idx], y } : y;
          });
          const compData = xKeys.map((xk, idx) => {
            const ns = compareLookup.get(`${sk}|${xk}`);
            if (ns == null) return usePointObjects ? { x: numericX[idx], y: null } : null;
            const y = toUnit(ns, unit);
            return usePointObjects ? { x: numericX[idx], y } : y;
          });

          const col = colorForSeries(sk);

          if (hasRealPoint(baseData)) {
            datasets.push({
              label: baseLabel,
              data: baseData,
              borderColor: col,
              backgroundColor: asLine ? col + '22' : col + 'bb',
              borderWidth: asLine ? 2 : 1,
              pointRadius: asLine ? 3 : 0,
              tension: 0.3,
            });
          }

          if (hasRealPoint(compData)) {
            if (asLine) {
              datasets.push({
                label: compLabel,
                data: compData,
                borderColor: col,
                backgroundColor: col + '22',
                borderDash: [7, 5],
                pointRadius: 2,
                borderWidth: 2,
                tension: 0.3,
                __compare: true,
                __dashed: true,
              });
            } else {
              const ctx = canvas.getContext('2d');
              const pc = document.createElement('canvas');
              pc.width = pc.height = 6;
              const pctx = pc.getContext('2d');
              pctx.clearRect(0, 0, 6, 6);
              pctx.strokeStyle = col;
              pctx.lineWidth = 1;
              pctx.beginPath();
              pctx.moveTo(0, 6);
              pctx.lineTo(6, 0);
              pctx.stroke();
              const pattern = ctx.createPattern(pc, 'repeat');
              datasets.push({
                label: compLabel,
                data: compData,
                borderColor: col,
                backgroundColor: pattern,
                borderWidth: 1,
                __hatch: col,
              });
            }
          }
        }
        return datasets;
      }

      function buildCactusDatasets() {
        const datasets = [];

        function cumulativePoints(values) {
          let sum = 0;
          return values.map((v, idx) => {
            sum += v;
            return { x: idx + 1, y: sum };
          });
        }

        for (let i = 0; i < seriesKeys.length; i += 1) {
          const sk = seriesKeys[i];
          const baseLabel = sk === '' ? metricLabel : (seriesLabelMap.get(sk) ?? sk);
          const compLabel = baseLabel + ' (compare)';
          const col = colorForSeries(sk);

          const baseVals = xKeys
            .map(xk => lookup.get(`${sk}|${xk}`))
            .filter(v => v != null)
            .map(v => toUnit(v, unit))
            .sort((a, b) => a - b);
          const compVals = xKeys
            .map(xk => compareLookup.get(`${sk}|${xk}`))
            .filter(v => v != null)
            .map(v => toUnit(v, unit))
            .sort((a, b) => a - b);

          const basePoints = cumulativePoints(baseVals);
          const compPoints = cumulativePoints(compVals);

          if (basePoints.length) {
            datasets.push({
              label: baseLabel,
              data: basePoints,
              borderColor: col,
              backgroundColor: col + '22',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.15,
            });
          }
          if (compPoints.length) {
            datasets.push({
              label: compLabel,
              data: compPoints,
              borderColor: col,
              backgroundColor: col + '22',
              borderDash: [7, 5],
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.15,
              __compare: true,
              __dashed: true,
            });
          }
        }

        return { datasets };
      }

      function buildScatter() {
        const hasCompareChoices = compareSeriesKeys.length > 0;
        const scatterOptions = [];
        const addScatterOption = (source, sk) => {
          const baseLabel = sk === '' ? metricLabel : (seriesLabelMap.get(sk) ?? sk);
          const value = `${source}::${sk}`;
          let label = baseLabel;
          if (source === 'compare') label = `${baseLabel} (compare)`;
          else if (hasCompareChoices) label = `${baseLabel} (base)`;
          scatterOptions.push({ value, label });
        };
        baseSeriesKeys.forEach(sk => addScatterOption('base', sk));
        compareSeriesKeys.forEach(sk => addScatterOption('compare', sk));

        if (scatterOptions.length < 2) {
          return { message: 'Scatter needs at least two labels.', datasets: [], legendDatasets: [], xLabel: null, yLabel: null, square: false };
        }

        const validScatterValues = new Set(scatterOptions.map(o => o.value));
        const parseChoice = raw => {
          const s = String(raw == null ? '' : raw);
          if (s.startsWith('compare::')) return { source: 'compare', key: s.slice('compare::'.length), raw: s };
          if (s.startsWith('base::')) return { source: 'base', key: s.slice('base::'.length), raw: s };
          // Backward compatibility for older temporary selections.
          return { source: 'base', key: s, raw: `base::${s}` };
        };
        const labelForChoice = choice => {
          const found = scatterOptions.find(o => o.value === choice.raw);
          if (found) return found.label;
          const fallbackBase = choice.key === '' ? metricLabel : (seriesLabelMap.get(choice.key) ?? choice.key);
          return choice.source === 'compare' ? `${fallbackBase} (compare)` : fallbackBase;
        };

        let sx;
        let sy;
        const pairValid = Array.isArray(state.scatterPair)
          && state.scatterPair.length === 2
          && validScatterValues.has(String(state.scatterPair[0]))
          && validScatterValues.has(String(state.scatterPair[1]))
          && state.scatterPair[0] !== state.scatterPair[1];

        if (pairValid) {
          sx = String(state.scatterPair[0]);
          sy = String(state.scatterPair[1]);
        } else if (scatterOptions.length === 2) {
          sx = scatterOptions[0].value;
          sy = scatterOptions[1].value;
          state.scatterPair = [sx, sy];
        } else {
          openScatterPairPrompt(scatterOptions);
          return { message: 'Select two labels to build the scatter plot.', datasets: [], legendDatasets: [], xLabel: null, yLabel: null, square: false };
        }

        const sxChoice = parseChoice(sx);
        const syChoice = parseChoice(sy);
        const sxLabel = labelForChoice(sxChoice);
        const syLabel = labelForChoice(syChoice);
        const valueForChoice = (choice, xk) => {
          const map = choice.source === 'compare' ? compareLookup : lookup;
          return map.get(`${choice.key}|${xk}`);
        };
        const pts = xKeys.map(xk => {
          const xNs = valueForChoice(sxChoice, xk);
          const yNs = valueForChoice(syChoice, xk);
          if (xNs == null || yNs == null) return null;
          return { x: toUnit(xNs, unit), y: toUnit(yNs, unit) };
        }).filter(Boolean);

        if (!pts.length) return { message: 'No shared data points were found for the selected labels.', datasets: [], legendDatasets: [], xLabel: null, yLabel: null, square: false };

        let minVal = Infinity;
        let maxVal = -Infinity;
        pts.forEach(p => {
          minVal = Math.min(minVal, p.x, p.y);
          maxVal = Math.max(maxVal, p.x, p.y);
        });
        const lower = Number.isFinite(focus.xMin) ? focus.xMin : (Number.isFinite(focus.yMin) ? focus.yMin : minVal);
        const upper = Number.isFinite(focus.xMax) ? focus.xMax : (Number.isFinite(focus.yMax) ? focus.yMax : maxVal);
        minVal = Number.isFinite(lower) ? lower : minVal;
        maxVal = Number.isFinite(upper) ? upper : maxVal;
        if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
          minVal = 0;
          maxVal = 1;
        }
        if (minVal > maxVal) {
          const tmp = minVal;
          minVal = maxVal;
          maxVal = tmp;
        }
        if (minVal === maxVal) {
          const pad = minVal === 0 ? 1 : Math.abs(minVal) * 0.1;
          minVal -= pad;
          maxVal += pad;
        }

        const col = colorForSeries(`${sxChoice.raw}|${syChoice.raw}|scatter`);
        const mainDataset = {
          label: `${syLabel} vs ${sxLabel}`,
          data: pts,
          borderColor: '#000000',
          backgroundColor: '#000000',
          borderWidth: 1,
          pointRadius: 5,
          pointHoverRadius: 6,
          pointStyle: 'crossRot',
          pointBackgroundColor: '#000000',
          pointBorderColor: '#000000',
          pointBorderWidth: 2,
          showLine: false,
        };
        const diagDataset = {
          label: 'y = x',
          data: [{ x: minVal, y: minVal }, { x: maxVal, y: maxVal }],
          borderColor: '#d33',
          backgroundColor: 'transparent',
          borderDash: [6, 4],
          pointRadius: 0,
          borderWidth: 2,
          showLine: true,
          fill: false,
          tension: 0,
          __auxiliary: true,
          __compare: true,
        };

        return {
          datasets: [mainDataset, diagDataset],
          legendDatasets: [mainDataset],
          noLegend: true,
          xLabel: sxLabel,
          yLabel: syLabel,
          xLabelDisplay: true,
          yLabelDisplay: true,
          square: false,
          xMin: minVal,
          xMax: maxVal,
          yMin: minVal,
          yMax: maxVal,
          xTickFormatter: fmtTickNumber,
          yTickFormatter: fmtTickNumber,
        };
      }

      const chartBase = { yLabel: unit, yUnit: unit };
      let chartType = 'line';
      let chartLabels = xIsNumeric ? [] : labels;
      let datasets = [];
      let legendDatasets = null;
      let opts = { ...chartBase };
      let square = false;
      let chartMessage = '';
      let hideLegend = false;

      if (requestedGraphType === 'histogram') {
        chartType = 'bar';
        chartLabels = labels;
        datasets = buildLineOrHistogramDatasets(false);
        opts = {
          ...chartBase,
          xType: 'category',
          yLog: state.logY,
        };
      } else if (requestedGraphType === 'scatter') {
        chartType = 'scatter';
        chartLabels = [];
        const scatter = buildScatter();
        datasets = scatter.datasets;
        legendDatasets = scatter.legendDatasets;
        square = !!scatter.square;
        chartMessage = scatter.message || '';
        hideLegend = !!scatter.noLegend;
        opts = {
          xLabel: scatter.xLabel,
          yLabel: scatter.yLabel,
          xLabelDisplay: true,
          yLabelDisplay: true,
          xType: state.logX ? 'logarithmic' : 'linear',
          yType: state.logY ? 'logarithmic' : 'linear',
          // Keep the same fixed card height as other plots; do not force
          // square canvas scaling, which can blur the scatter plot.
          maintainAspectRatio: false,
          xTickFormatter: scatter.xTickFormatter,
          yTickFormatter: scatter.yTickFormatter,
        };
      } else if (requestedGraphType === 'cactus') {
        chartType = 'line';
        const cactus = buildCactusDatasets();
        chartLabels = [];
        datasets = cactus.datasets;
        opts = {
          xLabel: 'Jobs finished',
          yLabel: unit,
          yUnit: unit,
          xType: state.logX ? 'logarithmic' : 'linear',
          yType: state.logY ? 'logarithmic' : 'linear',
        };
      } else {
        chartType = 'line';
        datasets = buildLineOrHistogramDatasets(true);
        opts = {
          ...chartBase,
          xType: xIsNumeric ? (state.logX && xCanLog ? 'logarithmic' : 'linear') : 'category',
          yLog: state.logY,
          xLabel: xIsNumeric ? String(xSource) : undefined,
        };
      }

      if (chartMessage) {
        const msg = document.createElement('div');
        msg.className = 'chart-message-box';
        msg.textContent = chartMessage;
        return { datasets: [], legendDatasets: null, chart: null, square, message: chartMessage, placeholder: msg };
      }

      const ch = mkChart(canvas, chartType, chartLabels, datasets, opts);

      // Preserve legend hidden/visible state across chart rebuilds.
      if (hiddenLegend && hiddenLegend.size && ch && Array.isArray(ch.data && ch.data.datasets)) {
        ch.data.datasets.forEach((ds, idx) => {
          if (!ds || ds.__auxiliary) return;
          if (hiddenLegend.has(String(ds.label || ''))) ch.setDatasetVisibility(idx, false);
        });
        try { ch.update(); } catch (e) {}
      }

      const onLegendToggle = ({ label, visible }) => {
        const key = String(label || '');
        if (!key) return;
        let set = state.hiddenLegendByGraph.get(visibilityKey);
        if (!set) {
          set = new Set();
          state.hiddenLegendByGraph.set(visibilityKey, set);
        }
        if (visible) set.delete(key);
        else set.add(key);
      };

      return { datasets, legendDatasets, chart: ch, square, noLegend: hideLegend, onLegendToggle };
    }));

    return grid;
  }

  function subtypeBuckets(sourceRuns, compareSourceRuns) {
    if (!state.subtypeDefs.length) {
      return [{ graphKey: 'all', titleSuffix: '', runsSubset: sourceRuns, compareRunsSubset: compareSourceRuns }];
    }

    const deepest = state.subtypeDefs.reduce((a, b) => (a.level >= b.level ? a : b));
    const idx = deepest.idx;
    const level = deepest.level;

    const bucketMap = new Map();
    for (const r of sourceRuns) {
      const segs = parseName(r.name).segments || [];
      const raw = String(segs[idx] ?? '');
      if (!bucketMap.has(raw)) {
        bucketMap.set(raw, {
          graphKey: `${idx}::${raw}`,
          titleSuffix: `Subtype ${level}: ${raw || '(none)'}`,
          runsSubset: [],
          compareRunsSubset: [],
        });
      }
      bucketMap.get(raw).runsSubset.push(r);
    }

    for (const r of (compareSourceRuns || [])) {
      const segs = parseName(r.name).segments || [];
      const raw = String(segs[idx] ?? '');
      if (!bucketMap.has(raw)) continue;
      bucketMap.get(raw).compareRunsSubset.push(r);
    }

    return [...bucketMap.values()].sort((a, b) =>
      a.titleSuffix.localeCompare(b.titleSuffix, undefined, { numeric: true })
    );
  }

  function buildGraphDisplayStudio(scatterOptions, xLogAvailable) {
    const studio = document.createElement('div');
    studio.className = 'mapping-studio graph-display-studio';

    const head = document.createElement('div');
    head.className = 'mapping-head';
    head.innerHTML =
      `<div class="mapping-head-main">` +
      `<div class="mapping-title">Graph Display Studio</div>` +
      `<div class="mapping-sub">Choose which graph cards are visible and how they are drawn.</div>` +
      `</div>`;
    studio.appendChild(head);

    const tools = document.createElement('div');
    tools.className = 'mapping-head-tools';
    head.appendChild(tools);

    const toggleBar = document.createElement('div');
    toggleBar.className = 'graph-toggle-row';
    tools.appendChild(toggleBar);

    function addToggleSwitch(label, key, title, disabled = false) {
      const wrap = document.createElement('label');
      wrap.className = 'graph-toggle-switch';
      if (disabled) wrap.classList.add('disabled');

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!state[key];
      input.disabled = disabled;
      input.title = title;
      input.addEventListener('change', () => {
        state[key] = input.checked;
        render();
      });

      const track = document.createElement('span');
      track.className = 'graph-toggle-track';
      const thumb = document.createElement('span');
      thumb.className = 'graph-toggle-thumb';
      track.appendChild(thumb);

      const text = document.createElement('span');
      text.className = 'graph-toggle-text';
      text.textContent = label;

      wrap.appendChild(input);
      wrap.appendChild(track);
      wrap.appendChild(text);
      toggleBar.appendChild(wrap);
    }

    addToggleSwitch('Log x', 'logX', xLogAvailable
      ? 'Use a logarithmic x axis when the x data are numeric and positive'
      : 'Log x is available only when the x data are numeric', !xLogAvailable);
    if (!xLogAvailable) state.logX = false;
    addToggleSwitch('Log y', 'logY', 'Use a logarithmic y axis');

    const graphWrap = document.createElement('label');
    graphWrap.className = 'mapping-ydata';
    graphWrap.innerHTML = '<span>Graph type</span>';
    const graphSel = document.createElement('select');
    const scatterRepickValue = '__scatter_repick__';
    [
      ['line', 'Standard line'],
      ['histogram', 'Histogram'],
      ['scatter', 'Scatter plot'],
      ['cactus', 'Cactus plot'],
    ].forEach(([value, text]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      if (value === 'scatter' && scatterOptions.length < 2) opt.disabled = true;
      graphSel.appendChild(opt);
    });

    // Hidden sentinel value used only while scatter is active.
    // It lets selecting visible "Scatter plot" fire `change` again so
    // users can re-open the pair prompt without a separate button.
    const repickOpt = document.createElement('option');
    repickOpt.value = scatterRepickValue;
    repickOpt.textContent = 'Scatter plot';
    repickOpt.hidden = true;
    graphSel.appendChild(repickOpt);

    if (state.graphType === 'scatter' && scatterOptions.length >= 2) {
      graphSel.value = scatterRepickValue;
    } else {
      graphSel.value = state.graphType;
      if (state.graphType === 'scatter' && scatterOptions.length < 2) graphSel.value = 'line';
    }
    graphSel.title = 'Choose graph type';
    graphSel.addEventListener('change', () => {
      const nextType = graphSel.value;
      const prevType = state.graphType;

      if (nextType === scatterRepickValue) {
        graphSel.value = prevType === 'scatter' ? scatterRepickValue : prevType;
        return;
      }

      // Open chooser only when scatter is actually selected.
      // Keep current chart displayed until user confirms the pair.
      if (nextType === 'scatter' && scatterOptions.length > 2) {
        graphSel.value = prevType === 'scatter' ? scatterRepickValue : prevType;
        openScatterPairPrompt(scatterOptions, {
          onApply: () => {
            state.graphType = 'scatter';
            graphSel.value = scatterRepickValue;
            render();
          },
          onCancel: () => {
            graphSel.value = state.graphType === 'scatter' ? scatterRepickValue : state.graphType;
          },
        });
        return;
      }

      state.graphType = nextType;
      render();
    });
    graphWrap.appendChild(graphSel);
    tools.appendChild(graphWrap);

    if (state.graphType === 'scatter' && scatterOptions.length < 2) {
      const note = document.createElement('div');
      note.className = 'mapping-sub';
      note.style.marginTop = '6px';
      note.textContent = 'Scatter plot needs at least two labels.';
      studio.appendChild(note);
    }

    return studio;
  }

  function buildSubtypeFilterBar() {
    const defs = [...state.subtypeDefs].sort((a, b) => a.level - b.level);
    if (defs.length <= 1) return { bar: null, filteredRuns: runs, filteredCompareRuns: compareRuns };

    const higher = defs.slice(0, -1);
    const bar = document.createElement('div');
    bar.className = 'subtype-filter-bar controls';

    let scoped = runs;
    let scopedCompare = compareRuns;
    for (const def of higher) {
      const key = String(def.level);
      const vals = sortLabels(scoped.map(r => {
        const segs = parseName(r.name).segments || [];
        return segs[def.idx] ?? '';
      }));
      if (!vals.length) continue;

      if (state.subtypeSelections[key] == null || !vals.includes(state.subtypeSelections[key])) {
        state.subtypeSelections[key] = vals[0];
      }

      const wrap = document.createElement('label');
      wrap.className = 'mapping-ydata';
      const title = document.createElement('span');
      title.textContent = `Subtype ${def.level}`;
      const sel = document.createElement('select');
      vals.forEach(v => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = v === '' ? '(none)' : String(v);
        sel.appendChild(o);
      });
      sel.value = state.subtypeSelections[key];
      sel.title = `Filter charts for Subtype ${def.level}`;
      sel.addEventListener('change', () => {
        state.subtypeSelections[key] = sel.value;
        render();
      });

      wrap.appendChild(title);
      wrap.appendChild(sel);
      bar.appendChild(wrap);

      scoped = scoped.filter(r => {
        const segs = parseName(r.name).segments || [];
        return String(segs[def.idx] ?? '') === String(state.subtypeSelections[key]);
      });

      scopedCompare = scopedCompare.filter(r => {
        const segs = parseName(r.name).segments || [];
        return String(segs[def.idx] ?? '') === String(state.subtypeSelections[key]);
      });
    }

    return { bar, filteredRuns: scoped, filteredCompareRuns: scopedCompare };
  }

  function openLabelEditor() {
    const subset = runs;
    const inferred = inferSources(subset, state.depth);
    const xSource = state.xSource === 'auto' ? inferred.xSource : state.xSource;
    const seriesSource = state.seriesSource === 'auto' ? inferred.seriesSource : state.seriesSource;

    const xVals = sortLabels(subset.map(r => {
      const v = valueForSource(r, xSource, state.depth);
      return v == null ? '' : String(v);
    }));
    const sVals = seriesSource === 'none' ? [] : sortLabels(subset.map(r => {
      const v = valueForSource(r, seriesSource, state.depth);
      return v == null ? '' : String(v);
    }));

    const overlay = document.createElement('div');
    overlay.className = 'label-editor-overlay';
    const box = document.createElement('div');
    box.className = 'label-editor';
    box.innerHTML = '<h3>Edit Label Names</h3>';

    function makeSection(title, source, vals) {
      const sec = document.createElement('div');
      sec.className = 'label-section';
      const h = document.createElement('h4');
      h.textContent = title;
      sec.appendChild(h);
      vals.forEach(v => {
        const row = document.createElement('div');
        row.className = 'label-row';
        const k = document.createElement('div');
        k.className = 'label-key';
        k.textContent = v || '(none)';
        const mapKey = `${source}::${v}`;
        const inp = document.createElement('input');
        inp.className = 'label-input';
        inp.value = state.overrides.has(mapKey) ? state.overrides.get(mapKey) : v;
        row.appendChild(k);
        row.appendChild(inp);
        sec.appendChild(row);
      });
      sec.dataset.source = source;
      return sec;
    }

    box.appendChild(makeSection(`X labels (${xSource})`, xSource, xVals));
    if (seriesSource !== 'none') box.appendChild(makeSection(`Series (${seriesSource})`, seriesSource, sVals));

    const actions = document.createElement('div');
    actions.className = 'label-actions';
    const save = document.createElement('button');
    save.className = 'file-btn';
    save.textContent = 'Save';
    const cancel = document.createElement('button');
    cancel.className = 'file-btn';
    cancel.textContent = 'Cancel';
    const reset = document.createElement('button');
    reset.className = 'file-btn';
    reset.textContent = 'Reset';
    actions.appendChild(save);
    actions.appendChild(reset);
    actions.appendChild(cancel);
    box.appendChild(actions);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if (e.target === overlay) document.body.removeChild(overlay);
    });

    save.addEventListener('click', () => {
      const secs = box.querySelectorAll('.label-section');
      secs.forEach(sec => {
        const source = sec.dataset.source || null;
        if (!source) return;
        sec.querySelectorAll('.label-row').forEach(row => {
          const key = row.querySelector('.label-key').textContent;
          const val = row.querySelector('.label-input').value;
          const mapKey = `${source}::${String(key === '(none)' ? '' : key)}`;
          if (String(val) === String(key) || (key === '(none)' && val === '')) state.overrides.delete(mapKey);
          else state.overrides.set(mapKey, val);
        });
      });
      try {
        const sk = `bench_viewer_overrides:${group}`;
        localStorage.setItem(sk, JSON.stringify(Object.fromEntries(state.overrides)));
      } catch (e) {}
      document.body.removeChild(overlay);
      render();
    });

    cancel.addEventListener('click', () => document.body.removeChild(overlay));
    reset.addEventListener('click', () => {
      for (const k of Array.from(state.overrides.keys())) {
        if (k.startsWith(xSource + '::') || k.startsWith(seriesSource + '::')) state.overrides.delete(k);
      }
      try {
        const sk = `bench_viewer_overrides:${group}`;
        const obj = Object.fromEntries(state.overrides);
        if (Object.keys(obj).length) localStorage.setItem(sk, JSON.stringify(obj));
        else localStorage.removeItem(sk);
      } catch (e) {}
      document.body.removeChild(overlay);
      render();
    });
  }

  editLabelsBtn.addEventListener('click', openLabelEditor);

  function render() {
    content.innerHTML = '';
    const { bar, filteredRuns, filteredCompareRuns } = buildSubtypeFilterBar();

    const inferred = inferSources(filteredRuns, state.depth);
    const xSource = state.xSource === 'auto' ? inferred.xSource : state.xSource;
    const xInfo = axisInfoFromSource(filteredRuns, xSource, state.depth);
    const xLogAvailable = (xInfo.isNumeric && xInfo.hasPositiveValues)
      || state.graphType === 'scatter'
      || state.graphType === 'cactus';
    if (!xLogAvailable) state.logX = false;

    const seriesSource = state.seriesSource === 'auto' ? inferred.seriesSource : state.seriesSource;
    const metricLabel = state.metric === 'cpu_time_ns' ? 'CPU time' : 'Wall time';
    const hasCompareData = !!(filteredCompareRuns && filteredCompareRuns.length);
    const scatterOptions = seriesSource === 'none'
      ? (() => {
        const opts = [{ value: 'base::', label: hasCompareData ? `${metricLabel} (base)` : metricLabel }];
        if (hasCompareData) opts.push({ value: 'compare::', label: `${metricLabel} (compare)` });
        return opts;
      })()
      : (() => {
        const values = [];
        const seen = new Set();
        const addFromRuns = (srcRuns, source) => {
          (srcRuns || []).forEach(r => {
            const raw = valueForSource(r, seriesSource, state.depth);
            const sRaw = raw == null ? '' : String(raw);
            const seriesKey = sRaw === '' ? '(none)' : sRaw;
            const value = `${source}::${seriesKey}`;
            if (seen.has(value)) return;
            seen.add(value);
            const mapKey = `${seriesSource}::${sRaw}`;
            const mapped = state.overrides.has(mapKey) ? state.overrides.get(mapKey) : sRaw;
            const baseLabel = (mapped == null || mapped === '') ? '(none)' : String(mapped);
            const label = source === 'compare'
              ? `${baseLabel} (compare)`
              : (hasCompareData ? `${baseLabel} (base)` : baseLabel);
            values.push({ value, label });
          });
        };
        addFromRuns(filteredRuns, 'base');
        addFromRuns(filteredCompareRuns, 'compare');

        values.sort((a, b) => {
          const av = String(a.value).replace(/^base::|^compare::/, '');
          const bv = String(b.value).replace(/^base::|^compare::/, '');
          const na = Number(av);
          const nb = Number(bv);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return String(a.label).localeCompare(String(b.label));
        });
        return values;
      })();
    if (state.graphType === 'scatter' && scatterOptions.length < 2) state.graphType = 'line';

    if (bar) {
      content.appendChild(bar);
    }

    const graphBuckets = subtypeBuckets(filteredRuns, filteredCompareRuns);
    const graphStudio = buildGraphDisplayStudio(scatterOptions, xLogAvailable);
    content.appendChild(graphStudio);

    const grid = document.createElement('div');
    grid.className = 'chart-grid';
    let cardCount = 0;
    graphBuckets.forEach(({ titleSuffix, runsSubset, compareRunsSubset }) => {
      const cardGrid = buildChartGrid(titleSuffix, runsSubset, compareRunsSubset);
      if (!cardGrid) return;
      const card = cardGrid.querySelector('.chart-card');
      if (!card) return;
      grid.appendChild(card);
      cardCount += 1;
    });

    if (cardCount === 1) grid.classList.add('single');
    if (cardCount > 0) content.appendChild(grid);
    // For the raw grouped view we show all subtype1 groups from the
    // original runs (not the dropdown-filtered subset) so users can
    // always see every subtype value irrespective of higher-level
    // dropdown selections.
    const compareByName = new Map((compareRuns || []).map(r => [r.name, r]));
    content.appendChild(buildTable(runs, {
      xSource,
      metric: state.metric,
      roles: roleAssignments,
      compareByName,
    }));
  }

  metricSel.addEventListener('change', () => {
    state.metric = metricSel.value;
    render();
  });

  renderExamplePicker();
  if (maxSegments > 0) {
    if (state.xSource === 'auto' && state.seriesSource === 'auto') applyRolesToState(buildAutoRoles());
    else applyRolesToState(rolesFromState());
  } else {
    render();
  }

  return panel;
}
