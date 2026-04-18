/*
 * chart-grid-builders.js
 * Non-scatter dataset builders used by chart-grid rendering.
 */

import { toUnit } from '../utils/time.js';

function hasRealPoint(values) {
    return values.some(v => {
        if (v == null) return false;
        if (typeof v === 'object') return v.y != null && Number.isFinite(Number(v.y));
        return Number.isFinite(Number(v));
    });
}

function toSeriesData({ xKeys, lookupMap, seriesKey, usePointObjects, numericX, unit }) {
    return xKeys.map((xk, idx) => {
        const ns = lookupMap.get(`${seriesKey}|${xk}`);
        if (ns == null) return usePointObjects ? { x: numericX[idx], y: null } : null;
        const y = toUnit(ns, unit);
        return usePointObjects ? { x: numericX[idx], y } : y;
    });
}

function buildHatchPattern(canvas, color) {
    const ctx = canvas.getContext('2d');
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = patternCanvas.height = 6;

    const pctx = patternCanvas.getContext('2d');
    pctx.clearRect(0, 0, 6, 6);
    pctx.strokeStyle = color;
    pctx.lineWidth = 1;
    pctx.beginPath();
    pctx.moveTo(0, 6);
    pctx.lineTo(6, 0);
    pctx.stroke();

    return ctx.createPattern(patternCanvas, 'repeat');
}

export function buildLineOrHistogramDatasets({
    asLine,
    metricLabel,
    seriesKeys,
    seriesLabelMap,
    xKeys,
    xIsNumeric,
    xNumericValues,
    lookup,
    compareLookup,
    unit,
    colorForSeries,
    state,
    canvas,
}) {
    const datasets = [];
    const numericX = xIsNumeric ? xNumericValues : null;
    const usePointObjects = asLine && xIsNumeric;

    for (let i = 0; i < seriesKeys.length; i += 1) {
        const sk = seriesKeys[i];
        const baseLabel = sk === '' ? metricLabel : (seriesLabelMap.get(sk) ?? sk);
        const compLabel = baseLabel + ' (compare)';

        const baseData = toSeriesData({
            xKeys,
            lookupMap: lookup,
            seriesKey: sk,
            usePointObjects,
            numericX,
            unit,
        });

        const compData = toSeriesData({
            xKeys,
            lookupMap: compareLookup,
            seriesKey: sk,
            usePointObjects,
            numericX,
            unit,
        });

        const col = colorForSeries(sk);
        const paletteIdx = state.seriesColorMap.get(String(sk));

        if (hasRealPoint(baseData)) {
            datasets.push({
                label: baseLabel,
                data: baseData,
                borderColor: col,
                backgroundColor: asLine ? col + '22' : col + 'bb',
                __paletteIdx: paletteIdx,
                borderWidth: asLine ? 2 : 1,
                pointRadius: asLine ? 3 : 0,
                tension: 0.3,
            });
        }

        if (hasRealPoint(compData)) {
            if (asLine) {
                datasets.push({
                    label: compLabel,
                    data: compData,
                    borderColor: col,
                    __paletteIdx: paletteIdx,
                    backgroundColor: col + '22',
                    borderDash: [7, 5],
                    pointRadius: 2,
                    borderWidth: 2,
                    tension: 0.3,
                    __compare: true,
                    __dashed: true,
                });
            } else {
                datasets.push({
                    label: compLabel,
                    data: compData,
                    borderColor: col,
                    __paletteIdx: paletteIdx,
                    backgroundColor: buildHatchPattern(canvas, col),
                    borderWidth: 1,
                    __hatch: col,
                });
            }
        }
    }

    return datasets;
}

export function buildCactusDatasets({
    metricLabel,
    seriesKeys,
    seriesLabelMap,
    xKeys,
    lookup,
    compareLookup,
    unit,
    colorForSeries,
    state,
}) {
    const datasets = [];

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

        if (basePoints.length) {
            datasets.push({
                label: baseLabel,
                data: basePoints,
                borderColor: col,
                backgroundColor: col + '22',
                __paletteIdx: state.seriesColorMap.get(String(sk)),
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
                __paletteIdx: state.seriesColorMap.get(String(sk)),
                borderDash: [7, 5],
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.15,
                __compare: true,
                __dashed: true,
            });
        }
    }

    return { datasets };
}
