/*
 * subtype-filters.js
 * Subtype bucketing and filter bar controls for panel views.
 */

import { parseName } from '../utils/bench.js';
import { sortLabels } from './source-utils.js';

export function subtypeBuckets({ state, sourceRuns, compareSourceRuns }) {
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

export function buildSubtypeFilterBar({ state, runs, compareRuns, render }) {
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
