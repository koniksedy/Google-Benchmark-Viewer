/*
 * source-utils.js
 * Source/value extraction and axis inference helpers for panel charts.
 */

import { parseName } from '../utils/bench.js';
import { parseNumericValue } from '../utils/number.js';

function toIgnoredSet(ignoredSegIdxs) {
    return ignoredSegIdxs instanceof Set ? ignoredSegIdxs : new Set();
}

function effectiveSegments(segments, ignoredSegIdxs) {
    const ignored = toIgnoredSet(ignoredSegIdxs);
    return (segments || []).filter((_, i) => !ignored.has(i));
}

export function inferSources(runsSubset, depth, maxArgs, ignoredSegIdxs) {
    const rows = runsSubset.map(r => parseName(r.name));
    const tails = rows.map(p => effectiveSegments(p.segments, ignoredSegIdxs).slice(depth));
    const hasTail = tails.some(t => t.length > 0);

    if (hasTail) {
        const prevVals = tails
            .map(t => (t.length >= 2 ? String(t[t.length - 2]) : ''))
            .filter(v => v !== '');
        const uniquePrev = new Set(prevVals);
        return {
            xSource: 'tail:last',
            seriesSource: uniquePrev.size > 1 ? 'tail:prev' : 'none',
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

export function valueForSource(run, source, depth, group, ignoredSegIdxs) {
    const parsed = parseName(run.name);
    const segs = parsed.segments || [];
    const tail = effectiveSegments(segs, ignoredSegIdxs).slice(depth);

    if (source === 'name') {
        const visibleName = tail.join('/');
        return visibleName || group;
    }
    if (source === 'tail:last') return tail.length ? tail[tail.length - 1] : null;
    if (source === 'tail:prev') return tail.length >= 2 ? tail[tail.length - 2] : null;

    if (source.startsWith('seg:')) {
        const i = Number(source.slice(4));
        return isNaN(i) ? null : (segs[i] ?? null);
    }

    if (source.startsWith('arg:')) {
        const i = Number(source.slice(4));
        return isNaN(i) ? null : (parsed.args[i] ?? null);
    }

    return null;
}

export function sortLabels(values) {
    const uniq = [...new Set(values.map(v => String(v)))];
    const allNumeric = uniq.every(v => !isNaN(Number(v)));
    return allNumeric
        ? uniq.sort((a, b) => Number(a) - Number(b))
        : uniq.sort((a, b) => a.localeCompare(b));
}

export function axisInfoFromSource(runsSubset, source, depth, group, ignoredSegIdxs) {
    const rawValues = runsSubset
        .map(r => valueForSource(r, source, depth, group, ignoredSegIdxs))
        .filter(v => v != null && v !== '');

    const numericValues = rawValues.map(parseNumericValue).filter(v => v != null);
    const isNumeric = rawValues.length > 0 && numericValues.length === rawValues.length;

    return {
        isNumeric,
        hasPositiveValues: isNumeric && numericValues.every(v => v > 0),
        numericValues,
    };
}
