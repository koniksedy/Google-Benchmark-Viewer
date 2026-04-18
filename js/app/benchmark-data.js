/*
 * benchmark-data.js
 * Data normalization and validation helpers.
 */

function timeToNs(value, unit) {
    if (value == null) return null;
    switch ((unit || '').toLowerCase()) {
        case 'ns': return Number(value);
        case 'us': return Number(value) * 1e3;
        case 'ms': return Number(value) * 1e6;
        case 's': return Number(value) * 1e9;
        default: return Number(value);
    }
}

/**
 * Normalize google-benchmark rows so all timing fields are available in ns.
 */
export function normalizeBenchmarks(data) {
    const benchmarks = (data.benchmarks || []).filter(run => !run.is_aggregate && run.name);

    for (const run of benchmarks) {
        const fallbackUnit = run.time_unit || (data.time_unit || 'us');
        run.real_time_ns = run.real_time_ns != null ? run.real_time_ns : timeToNs(run.real_time, fallbackUnit);
        run.cpu_time_ns = run.cpu_time_ns != null ? run.cpu_time_ns : timeToNs(run.cpu_time, fallbackUnit);

        if (!run.counters) run.counters = {};
        for (const key of Object.keys(run)) {
            if (/_per_second$/.test(key) && run[key] != null && run.counters[key] == null) {
                run.counters[key] = run[key];
            }
        }
    }

    return benchmarks;
}

/**
 * Count benchmark names that exist in both base and compare datasets.
 */
export function sharedBenchmarkCount(baseData, compareRuns) {
    const baseNames = new Set(normalizeBenchmarks(baseData).map(row => row.name));
    return compareRuns.reduce((count, row) => count + (baseNames.has(row.name) ? 1 : 0), 0);
}
