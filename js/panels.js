/*
 * panels.js
 * Build the UI panels for each benchmark group. This file focuses on
 * arranging charts + table views and exposes `buildPanel` which returns
 * a DOM node for a benchmark group.
 */
import { esc, bestUnit, toUnit, fmtNs, fmtCount, parseName, argDims, tpKey, medianNs } from './utils.js';
import { chartCard, legendHtml, mkChart } from './charts.js';

export function charts0d(group, runs) {
  // Single-dimension charts: bar chart per variant
  const unit = bestUnit(medianNs(runs));
  const labels = runs.map(r => r.name.replace(group + '/', '') || group);
  const ds = [{ label: 'CPU time', data: runs.map(r => toUnit(r.real_time_ns, unit)) }];
  const h = Math.max(160, labels.length * 28 + 60);
  const cards = [chartCard(group, `Time (${unit}) per variant`, h, canvas => {
    mkChart(canvas, 'bar', labels, ds, { yLabel: unit, yUnit: unit });
    return ds;
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
    mkChart(canvas, labels.length <= 10 ? 'line' : 'bar', labels, ds,
      { yLabel: unit, yUnit: unit });
    return ds;
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
    mkChart(canvas, 'line', labels, ds, { yLabel: unit, yUnit: unit });
    return ds;
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

export function buildTable(runs) {
  if (!runs.length) {
    const empty = document.createElement('div');
    empty.className = 'table-wrap';
    empty.innerHTML = '<p style="padding:12px 16px;color:var(--muted)">No rows for current selection.</p>';
    return empty;
  }

  const tk = tpKey(runs[0]);
  const isBytes = tk && /bytes/i.test(tk);
  const metricName = isBytes ? 'Throughput' : 'Items/s';
  const rows = runs.map(r => {
    let tp = '—';
    if (tk && r.counters && r.counters[tk] != null) {
      tp = isBytes
        ? (r.counters[tk] / 1e9).toFixed(2) + ' GB/s'
        : (r.counters[tk] / 1e6).toFixed(1) + ' M/s';
    }
    return `<tr>
      <td class="td-mono">${esc(r.name)}</td>
      <td class="td-right">${fmtNs(r.real_time_ns)}</td>
      <td class="td-right">${fmtNs(r.cpu_time_ns)}</td>
      <td class="td-right">${fmtCount(r.iterations)}</td>
      <td class="td-right">${tp}</td>
    </tr>`;
  }).join('');

  const wrap = document.createElement('details');
  wrap.className = 'raw-data';
  wrap.innerHTML =
    `<summary class="table-section-title">Raw data</summary>
     <div class="table-wrap"><table>
       <thead><tr>
         <th>Name</th>
         <th style="text-align:right">Wall time</th>
         <th style="text-align:right">CPU time</th>
         <th style="text-align:right">Iterations</th>
         <th style="text-align:right">${metricName}</th>
       </tr></thead>
       <tbody>${rows}</tbody>
     </table></div>`;
  return wrap;
}

export function buildPanel(group, runs) {
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
    metric: 'real_time_ns',
    depth: leadingTextDepth,
    xSource: 'auto',
    seriesSource: 'auto',
  };

  const mappingControls = document.createElement('div');
  mappingControls.className = 'controls';
  const subtypeControls = document.createElement('div');
  subtypeControls.className = 'controls';
  const content = document.createElement('div');

  panel.appendChild(mappingControls);
  panel.appendChild(subtypeControls);
  panel.appendChild(content);

  function createLabeledSelect(labelText, options, initialValue) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const select = document.createElement('select');
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.text;
      select.appendChild(opt);
    });
    if (initialValue != null) select.value = initialValue;
    mappingControls.appendChild(label);
    mappingControls.appendChild(select);
    return select;
  }

  function sourceOptions() {
    const opts = [{ value: 'auto', text: 'Auto' }, { value: 'name', text: 'Benchmark label' }];
    for (let i = 0; i < maxSegments; i += 1) opts.push({ value: `seg:${i}`, text: `Segment[${i}]` });
    opts.push({ value: 'tail:last', text: 'Tail last token' });
    opts.push({ value: 'tail:prev', text: 'Tail previous token' });
    for (let i = 0; i < maxArgs; i += 1) opts.push({ value: `arg:${i}`, text: `Arg[${i}]` });
    return opts;
  }

  const metricSel = createLabeledSelect('Y data:', [
    { value: 'real_time_ns', text: 'Wall time' },
    { value: 'cpu_time_ns', text: 'CPU time' },
  ], state.metric);

  const depthSel = createLabeledSelect('Hierarchy depth:',
    Array.from({ length: maxSegments + 1 }, (_, i) => ({ value: String(i), text: String(i) })),
    String(state.depth));

  const xSel = createLabeledSelect('X labels:', sourceOptions(), state.xSource);
  const seriesSel = createLabeledSelect('Series:', [{ value: 'none', text: 'None' }, ...sourceOptions()], state.seriesSource);

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

  function buildChartGrid(titleSuffix, runsSubset) {
    if (!runsSubset.length) return null;
    const inferred = inferSources(runsSubset, state.depth);
    const xSource = state.xSource === 'auto' ? inferred.xSource : state.xSource;
    const seriesSource = state.seriesSource === 'auto' ? inferred.seriesSource : state.seriesSource;
    const metricLabel = state.metric === 'cpu_time_ns' ? 'CPU time' : 'Wall time';

    const points = runsSubset.map(r => ({
      x: valueForSource(r, xSource, state.depth),
      s: seriesSource === 'none' ? '' : valueForSource(r, seriesSource, state.depth),
      y: r[state.metric],
    })).filter(p => p.x != null && p.x !== '' && p.y != null);

    if (!points.length) return null;

    const labels = sortLabels(points.map(p => p.x));
    const seriesVals = seriesSource === 'none'
      ? ['']
      : sortLabels(points.map(p => p.s == null || p.s === '' ? '(none)' : p.s));

    const yVals = points.map(p => p.y).sort((a, b) => a - b);
    const median = yVals[Math.floor(yVals.length / 2)] || 0;
    const unit = bestUnit(median);

    const lookup = new Map();
    for (const p of points) {
      const sk = seriesSource === 'none' ? '' : (p.s == null || p.s === '' ? '(none)' : String(p.s));
      lookup.set(`${sk}|${String(p.x)}`, p.y);
    }

    const ds = seriesVals.map(sk => ({
      label: sk === '' ? metricLabel : sk,
      data: labels.map(l => {
        const ns = lookup.get(`${sk}|${l}`);
        return ns != null ? toUnit(ns, unit) : null;
      })
    }));

    const title = group + (titleSuffix ? ' / ' + titleSuffix : '');
    const grid = document.createElement('div');
    grid.className = 'chart-grid';
    grid.appendChild(chartCard(title, `${metricLabel} (${unit})`, 240, canvas => {
      const asLine = ds.length > 1 || labels.length > 10;
      mkChart(canvas, asLine ? 'line' : 'bar', labels, ds, { yLabel: unit, yUnit: unit });
      return ds;
    }));
    return grid;
  }

  function buildSubtypeSelectors(depth) {
    subtypeControls.innerHTML = '';
    if (depth <= 0) return [];

    const selects = [];
    const leads = runs.map(r => {
      const segs = parseName(r.name).segments || [];
      return Array.from({ length: depth }, (_, i) => segs[i] ?? '');
    });

    for (let level = 0; level < depth; level += 1) {
      const label = document.createElement('label');
      label.textContent = level === 0 ? 'Type:' : `Subtype ${level}:`;
      const sel = document.createElement('select');
      selects.push(sel);
      subtypeControls.appendChild(label);
      subtypeControls.appendChild(sel);
    }

    function refill(startLevel) {
      const prefix = selects.slice(0, startLevel).map(s => s.value);
      for (let level = startLevel; level < depth; level += 1) {
        const values = new Set();
        leads.forEach(lead => {
          let ok = true;
          for (let i = 0; i < level; i += 1) {
            if (lead[i] !== prefix[i]) { ok = false; break; }
          }
          if (ok) values.add(lead[level] || '');
        });
        const sorted = [...values].sort((a, b) => String(a).localeCompare(String(b)));
        const sel = selects[level];
        const prev = sel.value;
        sel.innerHTML = '';
        sorted.forEach(v => {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = v || '(none)';
          sel.appendChild(o);
        });
        if (sorted.includes(prev)) sel.value = prev;
        else if (sorted.length) sel.value = sorted[0];
        prefix[level] = sel.value;
      }
    }

    selects.forEach((s, i) => s.addEventListener('change', () => {
      refill(i + 1);
      render();
    }));
    refill(0);
    return selects;
  }

  let subtypeSelects = buildSubtypeSelectors(state.depth);

  function currentSubset() {
    if (!subtypeSelects.length) return runs;
    const vals = subtypeSelects.map(s => s.value);
    return runs.filter(r => {
      const segs = parseName(r.name).segments || [];
      for (let i = 0; i < vals.length; i += 1) {
        if ((segs[i] ?? '') !== vals[i]) return false;
      }
      return true;
    });
  }

  function render() {
    content.innerHTML = '';
    const subset = currentSubset();
    const titleSuffix = subtypeSelects.map(s => s.value).filter(Boolean).join('/');
    const grid = buildChartGrid(titleSuffix, subset);
    if (grid) content.appendChild(grid);
    content.appendChild(buildTable(subset));
  }

  metricSel.addEventListener('change', () => { state.metric = metricSel.value; render(); });
  depthSel.addEventListener('change', () => {
    state.depth = Number(depthSel.value) || 0;
    subtypeSelects = buildSubtypeSelectors(state.depth);
    render();
  });
  xSel.addEventListener('change', () => { state.xSource = xSel.value; render(); });
  seriesSel.addEventListener('change', () => { state.seriesSource = seriesSel.value; render(); });

  render();

  return panel;
}
