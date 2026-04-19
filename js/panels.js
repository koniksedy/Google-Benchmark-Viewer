/*
 * panels.js
 * Build the UI panels for each benchmark group. This file focuses on
 * arranging charts + table views and exposes `buildPanel` which returns
 * a DOM node for a benchmark group.
 */
import { parseName } from './utils/bench.js';
import { getColors } from './charts.js';
import { buildTable } from './panels/raw-table.js';
import { buildChartGrid } from './panels/chart-grid.js';
import { subtypeBuckets, buildSubtypeFilterBar } from './panels/subtype-filters.js';
import { buildGraphDisplayStudio } from './panels/graph-studio.js';
import { openLabelEditor } from './panels/label-editor.js';
import { createMappingStudio } from './panels/mapping-studio.js';
import {
    normalizeRoles as normalizeRoleAssignments,
    buildAutoRoles as buildAutoRoleAssignments,
    rolesFromState as deriveRolesFromState,
} from './panels/role-mapping.js';
import {
    inferSources,
    valueForSource,
    sortLabels,
    axisInfoFromSource,
} from './panels/source-utils.js';

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
        // label -> palette index (not raw color) so theme changes keep mapping stable
        seriesColorMap: new Map(),
        nextSeriesColorIdx: 0,
        scatterPair: null,
        scatterPairPrompting: false,
        hiddenLegendByGraph: new Map(),
        ignoredSegIdxs: new Set(),
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

    const mappingStudio = createMappingStudio({
        group,
        sampleSegments,
        maxSegments,
        initialMetric: state.metric,
        onApplyRoles: roles => applyRolesToState(roles),
    });
    const {
        mappingControls,
        content,
        metricSel,
        resetRolesBtn,
        editLabelsBtn,
        getRoleAssignments,
        setRoleAssignments,
        renderExamplePicker,
    } = mappingStudio;
    panel.appendChild(mappingControls);
    panel.appendChild(content);

    state.subtypeSelections = {};


    function applyRolesToState(roles) {
        const normalized = normalizeRoleAssignments(maxSegments, roles);
        let xIdx = -1;
        let seriesIdx = -1;
        const ignoredSegIdxs = new Set();
        const subtypeDefs = [];

        normalized.forEach((r, i) => {
            if (r === 'x') xIdx = i;
            else if (r === 'series') seriesIdx = i;
            else if (r === 'ignore') ignoredSegIdxs.add(i);
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
        state.ignoredSegIdxs = ignoredSegIdxs;
        state.subtypeSelections = {};

        setRoleAssignments(normalized);
        render();
    }

    resetRolesBtn.addEventListener('click', () => applyRolesToState(buildAutoRoleAssignments(maxSegments, segmentValues)));


    function colorForSeries(label) {
        const key = String(label);
        const palette = getColors();
        if (state.seriesColorMap.has(key)) {
            const idx = state.seriesColorMap.get(key);
            return palette[idx % palette.length];
        }
        const idx = state.nextSeriesColorIdx;
        state.nextSeriesColorIdx += 1;
        state.seriesColorMap.set(key, idx);
        return palette[idx % palette.length];
    }

    editLabelsBtn.addEventListener('click', () => {
        openLabelEditor({ group, runs, state, maxArgs, render });
    });

    function render() {
        content.innerHTML = '';
        const { bar, filteredRuns, filteredCompareRuns } = buildSubtypeFilterBar({
            state,
            runs,
            compareRuns,
            render,
        });

        const inferred = inferSources(filteredRuns, state.depth, maxArgs, state.ignoredSegIdxs);
        const xSource = state.xSource === 'auto' ? inferred.xSource : state.xSource;
        const xInfo = axisInfoFromSource(filteredRuns, xSource, state.depth, group, state.ignoredSegIdxs);
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
                        const raw = valueForSource(r, seriesSource, state.depth, group, state.ignoredSegIdxs);
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

        const graphBuckets = subtypeBuckets({
            state,
            sourceRuns: filteredRuns,
            compareSourceRuns: filteredCompareRuns,
        });
        const graphStudio = buildGraphDisplayStudio({ state, scatterOptions, xLogAvailable, render });
        content.appendChild(graphStudio);

        const grid = document.createElement('div');
        grid.className = 'chart-grid';
        let cardCount = 0;
        graphBuckets.forEach(({ titleSuffix, runsSubset, compareRunsSubset }) => {
            const cardGrid = buildChartGrid({
                group,
                titleSuffix,
                runsSubset,
                compareRunsSubset,
                state,
                maxArgs,
                colorForSeries,
                render,
            });
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
            roles: getRoleAssignments(),
            compareByName,
        }));
    }

    metricSel.addEventListener('change', () => {
        state.metric = metricSel.value;
        render();
    });

    renderExamplePicker();
    if (maxSegments > 0) {
        if (state.xSource === 'auto' && state.seriesSource === 'auto') {
            applyRolesToState(buildAutoRoleAssignments(maxSegments, segmentValues));
        } else {
            applyRolesToState(deriveRolesFromState(maxSegments, state));
        }
    } else {
        render();
    }

    return panel;
}
