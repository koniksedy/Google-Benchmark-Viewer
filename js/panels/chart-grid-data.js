/*
 * chart-grid-data.js
 * Shared data preparation for panel chart-grid rendering.
 */

import { bestUnit } from '../utils/time.js';
import { parseNumericValue } from '../utils/number.js';
import { valueForSource, sortLabels, axisInfoFromSource } from './source-utils.js';

function buildPoints({ runs, state, xSource, seriesSource, group }) {
    function applyOverride(source, raw) {
        if (raw == null) return raw;
        const key = `${source}::${String(raw)}`;
        return state.overrides.has(key) ? state.overrides.get(key) : raw;
    }

    return (runs || []).map(run => {
        const rawX = valueForSource(run, xSource, state.depth, group, state.ignoredSegIdxs);
        const rawS = seriesSource === 'none' ? '' : valueForSource(run, seriesSource, state.depth, group, state.ignoredSegIdxs);
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
            y: run[state.metric],
        };
    }).filter(point => point.xKey != null && point.xKey !== '' && point.y != null);
}

function focusValue(raw) {
    if (raw === '' || raw == null) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
}

export function prepareChartGridData({
    group,
    runsSubset,
    compareRunsSubset,
    state,
    xSource,
    seriesSource,
}) {
    const points = buildPoints({
        runs: runsSubset,
        state,
        xSource,
        seriesSource,
        group,
    });
    const comparePoints = buildPoints({
        runs: compareRunsSubset,
        state,
        xSource,
        seriesSource,
        group,
    });

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
    for (const p of points) lookup.set(`${p.sKey}|${p.xKey}`, p.y);

    const compareLookup = new Map();
    for (const p of comparePoints) compareLookup.set(`${p.sKey}|${p.xKey}`, p.y);

    const xInfo = axisInfoFromSource(runsSubset, xSource, state.depth, group, state.ignoredSegIdxs);
    const xIsNumeric = xInfo.isNumeric;
    const xCanLog = xInfo.hasPositiveValues;
    const xNumericValues = xKeys.map(k => parseNumericValue(k));

    const focus = {
        xMin: focusValue(state.focus.xMin),
        xMax: focusValue(state.focus.xMax),
        yMin: focusValue(state.focus.yMin),
        yMax: focusValue(state.focus.yMax),
    };

    return {
        points,
        comparePoints,
        xKeys,
        labels,
        seriesKeys,
        baseSeriesKeys,
        compareSeriesKeys,
        seriesLabelMap,
        unit,
        lookup,
        compareLookup,
        xIsNumeric,
        xCanLog,
        xNumericValues,
        focus,
    };
}
