/*
 * utils.js
 * Small utility functions used across the bench viewer.
 * - formatting helpers (fmtNs, fmtVal, fmtCount)
 * - name parsing and grouping helpers (parseName, groupByPrefix)
 * - simple data inspection helpers (argDims, tpKey, medianNs)
 */

/** Escape a string for HTML insertion. */
export function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** Select a human-friendly time unit for a median number of nanoseconds. */
export function bestUnit(medianNs) {
  if (medianNs >= 1e9)  return 's';
  if (medianNs >= 1e6)  return 'ms';
  if (medianNs >= 1e3)  return 'µs';
  return 'ns';
}

export const unitDiv = { s:1e9, ms:1e6, 'µs':1e3, ns:1 };

/** Convert a value in nanoseconds to the requested unit. */
export function toUnit(ns, u) { return ns / (unitDiv[u] || 1); }

/** Format numeric values for tooltips/axes. */
export function fmtVal(v, unit) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  if (!unit) return v.toFixed(3);
  if (unit === '×')    return v.toFixed(1) + '×';
  if (unit === 'GB/s') return v.toFixed(2) + ' GB/s';
  if (unit === 'M/s')  return v.toFixed(1) + ' M/s';
  return v.toFixed(3) + ' ' + unit;
}

/** Format nanoseconds into a human string with unit. */
export function fmtNs(ns) {
  const u = bestUnit(ns);
  return toUnit(ns, u).toFixed(3) + ' ' + u;
}

/** Format large counts (iterations) into compact string. */
export function fmtCount(n) {
  if (n >= 1e9) return (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

/**
 * parseName(name)
 * Split a benchmark `name` into a `group` (prefix before first slash),
 * `args` (converted numeric tokens after first slash) and `segments`
 * (raw tokens after the slash). This keeps logic centralized.
 */
export function parseName(name) {
  const slash = name.indexOf('/');
  if (slash === -1) return { group: name, args: [] };
  const parts = name.slice(slash + 1).split('/');
  return {
    group: name.slice(0, slash),
    args:  parts.map(p => isNaN(p) || p === '' ? p : Number(p)),
    segments: parts
  };
}

/** Group runs by their prefix (everything before first slash). */
export function groupByPrefix(benchmarks) {
  const map = new Map();
  for (const r of benchmarks) {
    if (r.is_aggregate) continue;
    const { group } = parseName(r.name);
    if (!map.has(group)) map.set(group, []);
    map.get(group).push(r);
  }
  return map;
}

/** Return an array of sorted unique value sets for each argument position. */
export function argDims(runs) {
  const cols = [];
  for (const r of runs) {
    parseName(r.name).args.forEach((a, i) => {
      if (!cols[i]) cols[i] = new Set();
      cols[i].add(a);
    });
  }
  return cols.map(s => [...s].sort((a, b) => {
    const na = Number(a), nb = Number(b);
    return !isNaN(na) && !isNaN(nb) ? na - nb : String(a).localeCompare(String(b));
  }));
}

/** Choose a throughput-like counter key if present. */
export function tpKey(run) {
  const keys = Object.keys(run.counters || {});
  return keys.find(k => /bytes|items|throughput|per_second/i.test(k)) || null;
}

/** Return the median real_time_ns from a set of runs. */
export function medianNs(runs) {
  const sorted = runs.map(r => r.real_time_ns).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
