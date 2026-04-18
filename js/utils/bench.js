/*
 * bench.js
 * Name parsing and grouping helpers for benchmark rows.
 */

/**
 * Split a benchmark name into the prefix group and slash-delimited segments.
 * Numeric tokens are returned as numbers in `args` for easier charting.
 */
export function parseName(name) {
    const slash = name.indexOf('/');
    if (slash === -1) return { group: name, args: [] };
    const parts = name.slice(slash + 1).split('/');
    return {
        group: name.slice(0, slash),
        args: parts.map(p => (isNaN(p) || p === '' ? p : Number(p))),
        segments: parts,
    };
}

/** Group runs by their prefix (everything before the first slash). */
export function groupByPrefix(benchmarks) {
    const map = new Map();
    for (const run of benchmarks) {
        if (run.is_aggregate) continue;
        const { group } = parseName(run.name);
        if (!map.has(group)) map.set(group, []);
        map.get(group).push(run);
    }
    return map;
}

/** Return sorted unique value sets for each argument position. */
export function argDims(runs) {
    const cols = [];
    for (const run of runs) {
        parseName(run.name).args.forEach((arg, i) => {
            if (!cols[i]) cols[i] = new Set();
            cols[i].add(arg);
        });
    }

    return cols.map(set => [...set].sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        return !isNaN(na) && !isNaN(nb)
            ? na - nb
            : String(a).localeCompare(String(b));
    }));
}

/** Return the median real_time_ns from a set of runs. */
export function medianNs(runs) {
    const sorted = runs.map(r => r.real_time_ns).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}
