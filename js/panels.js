/*
 * panels.js
 * Build the UI panels for each benchmark group. This file focuses on
 * arranging charts + table views and exposes `buildPanel` which returns
 * a DOM node for a benchmark group.
 */
import { esc, bestUnit, toUnit, fmtNs, fmtCount, parseName, argDims, medianNs } from './utils.js';
import { chartCard, mkChart, getColors } from './charts.js';

export function charts0d(group, runs) {
  // Single-dimension charts: bar chart per variant
  const unit = bestUnit(medianNs(runs));
  const labels = runs.map(r => r.name.replace(group + '/', '') || group);
  const ds = [{ label: 'CPU time', data: runs.map(r => toUnit(r.real_time_ns, unit)) }];
  const h = Math.max(160, labels.length * 28 + 60);
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

  const h = 240;
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

  const cards = [chartCard(group, `Time (${unit}) — series = arg[${i0}], x = arg[${i1}]`, 260, canvas => {
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

    const hasCompare = comparePoints.length > 0;
    const requestedGraphType = state.graphType || 'line';
    const canScatter = !hasCompare && seriesKeys.length === 2;
    const effectiveGraphType = (requestedGraphType === 'scatter' && !canScatter)
      ? 'line'
      : requestedGraphType;
    const graphLabel =
      effectiveGraphType === 'histogram' ? 'Histogram'
      : effectiveGraphType === 'scatter' ? 'Scatter'
      : effectiveGraphType === 'cactus' ? 'Cactus (cumulative)'
      : (requestedGraphType === 'scatter' && !canScatter ? 'Line (scatter unavailable)' : 'Line');

    grid.appendChild(chartCard(title, `${metricLabel} (${unit}) — ${graphLabel}`, effectiveGraphType === 'scatter' ? 320 : 240, canvas => {
      function buildLineOrHistogramDatasets(asLine) {
        const datasets = [];
        for (let i = 0; i < seriesKeys.length; i += 1) {
          const sk = seriesKeys[i];
          const baseLabel = sk === '' ? metricLabel : (seriesLabelMap.get(sk) ?? sk);
          const compLabel = baseLabel + ' (compare)';

          const baseData = xKeys.map(xk => {
            const ns = lookup.get(`${sk}|${xk}`);
            return ns != null ? toUnit(ns, unit) : null;
          });
          const compData = xKeys.map(xk => {
            const ns = compareLookup.get(`${sk}|${xk}`);
            return ns != null ? toUnit(ns, unit) : null;
          });

          const col = colorForSeries(sk);

          if (baseData.some(v => v != null)) {
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

          if (compData.some(v => v != null)) {
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
        let maxLen = 0;

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
          maxLen = Math.max(maxLen, basePoints.length, compPoints.length);

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
              __dashed: true,
            });
          }
        }

        return { datasets, maxLen };
      }

      function buildScatter() {
        if (seriesKeys.length < 2) return { datasets: [], legendDatasets: [], xLabel: null, yLabel: null, square: true };
        let sx, sy;
        if (Array.isArray(state.scatterPair) && state.scatterPair.length === 2
            && seriesKeys.includes(state.scatterPair[0]) && seriesKeys.includes(state.scatterPair[1])) {
          sx = state.scatterPair[0];
          sy = state.scatterPair[1];
        } else {
          sx = seriesKeys[0];
          sy = seriesKeys[1];
        }
        const sxLabel = sx === '' ? metricLabel : (seriesLabelMap.get(sx) ?? sx);
        const syLabel = sy === '' ? metricLabel : (seriesLabelMap.get(sy) ?? sy);
        const pts = xKeys.map(xk => {
          const xNs = lookup.get(`${sx}|${xk}`);
          const yNs = lookup.get(`${sy}|${xk}`);
          if (xNs == null || yNs == null) return null;
          return { x: toUnit(xNs, unit), y: toUnit(yNs, unit) };
        }).filter(Boolean);

        if (!pts.length) return { datasets: [], legendDatasets: [], xLabel: null, yLabel: null, square: true };

        let minVal = Infinity;
        let maxVal = -Infinity;
        pts.forEach(p => {
          minVal = Math.min(minVal, p.x, p.y);
          maxVal = Math.max(maxVal, p.x, p.y);
        });
        const lower = focus.xMin != null ? focus.xMin : (focus.yMin != null ? focus.yMin : minVal);
        const upper = focus.xMax != null ? focus.xMax : (focus.yMax != null ? focus.yMax : maxVal);
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

        const col = colorForSeries(`${sx}|${sy}|scatter`);
        const mainDataset = {
          label: `${syLabel} vs ${sxLabel}`,
          data: pts,
          borderColor: col,
          backgroundColor: col + '66',
          pointRadius: 4,
          showLine: false,
        };
        const diagDataset = {
          label: 'y = x',
          data: [{ x: minVal, y: minVal }, { x: maxVal, y: maxVal }],
          borderColor: getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#5c6880',
          backgroundColor: 'transparent',
          borderDash: [6, 4],
          pointRadius: 0,
          borderWidth: 1.5,
          showLine: true,
          fill: false,
          tension: 0,
          __auxiliary: true,
        };

        return {
          datasets: [mainDataset, diagDataset],
          legendDatasets: [mainDataset],
          xLabel: `${sxLabel} (${unit})`,
          yLabel: `${syLabel} (${unit})`,
          square: true,
          xMin: focus.xMin != null ? focus.xMin : minVal,
          xMax: focus.xMax != null ? focus.xMax : maxVal,
          yMin: focus.yMin != null ? focus.yMin : minVal,
          yMax: focus.yMax != null ? focus.yMax : maxVal,
        };
      }

      function numericBound(v) {
        return Number.isFinite(v) ? v : null;
      }

      let chartType = 'line';
      let chartLabels = labels;
      let datasets = [];
      let legendDatasets = null;
      let opts = { yLabel: unit, yUnit: unit };
      let square = false;

      if (effectiveGraphType === 'histogram') {
        chartType = 'bar';
        datasets = buildLineOrHistogramDatasets(false);
        opts = {
          yLabel: unit,
          yUnit: unit,
          xType: 'category',
          yLog: state.logY,
          dragZoom: true,
        };
      } else if (effectiveGraphType === 'scatter') {
        chartType = 'scatter';
        chartLabels = [];
        const scatter = buildScatter();
        datasets = scatter.datasets;
        legendDatasets = scatter.legendDatasets;
        square = !!scatter.square;
        opts = {
          xLabel: scatter.xLabel,
          yLabel: scatter.yLabel,
          yUnit: unit,
          xType: state.logX ? 'logarithmic' : 'linear',
          yType: state.logY ? 'logarithmic' : 'linear',
          maintainAspectRatio: true,
          aspectRatio: 1,
          dragZoom: true,
        };
      } else if (effectiveGraphType === 'cactus') {
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
          dragZoom: true,
        };
      } else {
        chartType = 'line';
        datasets = buildLineOrHistogramDatasets(true);
        opts = {
          yLabel: unit,
          yUnit: unit,
          xType: 'category',
          yLog: state.logY,
          dragZoom: true,
        };
      }

      const ch = mkChart(canvas, chartType, chartLabels, datasets, opts);
      return { datasets, legendDatasets, chart: ch, square };
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

  function buildGraphDisplayStudio(scatterAllowed) {
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

    // toggle buttons (left of graph type)
    const toggleBar = document.createElement('div');
    toggleBar.className = 'graph-toggle-row';
    tools.appendChild(toggleBar);

    function addToggleButton(label, key, title, disabled = false) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'graph-toggle-btn' + (state[key] ? ' active' : '');
      btn.disabled = disabled;
      btn.title = title;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        state[key] = !state[key];
        btn.classList.toggle('active', state[key]);
        render();
      });
      toggleBar.appendChild(btn);
    }

    addToggleButton('Log x', 'logX', 'Use a logarithmic x axis where the selected graph type supports numeric x values', false);
    addToggleButton('Log y', 'logY', 'Use a logarithmic y axis', false);

    const graphWrap = document.createElement('label');
    graphWrap.className = 'mapping-ydata';
    graphWrap.innerHTML = '<span>Graph type</span>';
    const graphSel = document.createElement('select');
    [
      ['line', 'Standard line'],
      ['histogram', 'Histogram'],
      ['scatter', 'Scatter plot'],
      ['cactus', 'Cactus plot'],
    ].forEach(([value, text]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      graphSel.appendChild(opt);
    });
    graphSel.value = state.graphType;
    graphSel.title = 'Choose graph type';
    graphSel.addEventListener('change', () => {
      state.graphType = graphSel.value;
      render();
    });
    graphWrap.appendChild(graphSel);
    tools.appendChild(graphWrap);

    const focusHint = document.createElement('div');
    focusHint.className = 'mapping-sub';
    focusHint.style.marginTop = '8px';
    focusHint.textContent = 'Tip: drag on a chart to zoom; double-click to reset.';
    studio.appendChild(focusHint);

    // if more than two distinct series are present, offer pair selectors
    // seriesVals is provided by caller (render) when available
    if (Array.isArray(arguments[1]) && arguments[1].length > 2) {
      const seriesVals = arguments[1];
      const pairWrap = document.createElement('div');
      pairWrap.className = 'controls';
      pairWrap.style.gap = '8px';

      const spanX = document.createElement('label');
      spanX.className = 'mapping-ydata';
      spanX.innerHTML = '<span>X series</span>';
      const selX = document.createElement('select');
      seriesVals.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; selX.appendChild(o); });
      spanX.appendChild(selX);
      pairWrap.appendChild(spanX);

      const spanY = document.createElement('label');
      spanY.className = 'mapping-ydata';
      spanY.innerHTML = '<span>Y series</span>';
      const selY = document.createElement('select');
      seriesVals.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; selY.appendChild(o); });
      spanY.appendChild(selY);
      pairWrap.appendChild(spanY);

      if (!Array.isArray(state.scatterPair) || state.scatterPair.length !== 2) state.scatterPair = [seriesVals[0], seriesVals[1]];
      selX.value = state.scatterPair[0];
      selY.value = state.scatterPair[1];
      selX.addEventListener('change', () => { state.scatterPair[0] = selX.value; render(); });
      selY.addEventListener('change', () => { state.scatterPair[1] = selY.value; render(); });

      studio.appendChild(pairWrap);
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
    const seriesSource = state.seriesSource === 'auto' ? inferred.seriesSource : state.seriesSource;
    const seriesVals = seriesSource === 'none'
      ? ['']
      : sortLabels([...new Set(filteredRuns.map(r => {
        const raw = valueForSource(r, seriesSource, state.depth);
        const s = raw == null ? '' : String(raw);
        return s === '' ? '(none)' : s;
      }))]);
    const uniqueSeries = seriesVals.length;
    const scatterAllowed = (filteredCompareRuns || []).length === 0 && uniqueSeries >= 2;
    if (state.graphType === 'scatter' && !scatterAllowed) state.graphType = 'line';

    if (bar) {
      content.appendChild(bar);
    }

    const graphBuckets = subtypeBuckets(filteredRuns, filteredCompareRuns);
    const graphStudio = buildGraphDisplayStudio(scatterAllowed, seriesVals);
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
    const xSource = state.xSource === 'auto' ? inferred.xSource : state.xSource;
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
