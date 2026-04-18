/*
 * chart-grid-scatter.js
 * Scatter-specific dataset builder for chart grid rendering.
 */

import { toUnit } from '../utils/time.js';
import { fmtTickNumber } from '../utils/number.js';
import { openScatterPairPrompt } from './scatter-prompt.js';

export function buildScatter({
    metricLabel,
    baseSeriesKeys,
    compareSeriesKeys,
    seriesLabelMap,
    state,
    xKeys,
    lookup,
    compareLookup,
    unit,
    focus,
    render,
}) {
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
        openScatterPairPrompt({ state, seriesOptions: scatterOptions, onRender: render });
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
