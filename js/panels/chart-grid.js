/*
 * chart-grid.js
 * Chart grid composition for a panel graph bucket.
 */

import { chartCard, mkChart } from '../charts.js';
import { inferSources } from './source-utils.js';
import { prepareChartGridData } from './chart-grid-data.js';
import {
    buildLineOrHistogramDatasets,
    buildCactusDatasets,
} from './chart-grid-builders.js';
import { buildScatter } from './chart-grid-scatter.js';

export function buildChartGrid({
    group,
    titleSuffix,
    runsSubset,
    compareRunsSubset,
    state,
    maxArgs,
    colorForSeries,
    render,
}) {
    if (!runsSubset.length && !(compareRunsSubset && compareRunsSubset.length)) return null;
    const inferred = inferSources(runsSubset, state.depth, maxArgs);
    const xSource = state.xSource === 'auto' ? inferred.xSource : state.xSource;
    const seriesSource = state.seriesSource === 'auto' ? inferred.seriesSource : state.seriesSource;
    const metricLabel = state.metric === 'cpu_time_ns' ? 'CPU time' : 'Wall time';

    const gridData = prepareChartGridData({
        group,
        runsSubset,
        compareRunsSubset,
        state,
        xSource,
        seriesSource,
    });
    if (!gridData) return null;

    const {
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
    } = gridData;

    const title = group + (titleSuffix ? ' / ' + titleSuffix : '');
    const grid = document.createElement('div');
    grid.className = 'chart-grid';

    const requestedGraphType = state.graphType || 'line';
    const visibilityKey = [requestedGraphType, titleSuffix || '', xSource, seriesSource].join('|');
    const hiddenLegend = state.hiddenLegendByGraph.get(visibilityKey) || new Set();
    const graphLabel =
        requestedGraphType === 'histogram' ? 'Histogram'
            : requestedGraphType === 'scatter' ? 'Scatter'
                : requestedGraphType === 'cactus' ? 'Cactus (cumulative)'
                    : 'Line';

    grid.appendChild(chartCard(title, `${metricLabel} (${unit}) — ${graphLabel}`, 320, canvas => {
        const chartBase = { yLabel: unit, yUnit: unit };
        let chartType = 'line';
        let chartLabels = xIsNumeric ? [] : labels;
        let datasets = [];
        let legendDatasets = null;
        let opts = { ...chartBase };
        let square = false;
        let chartMessage = '';
        let hideLegend = false;

        if (requestedGraphType === 'histogram') {
            chartType = 'bar';
            chartLabels = labels;
            datasets = buildLineOrHistogramDatasets({
                asLine: false,
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
            });
            opts = {
                ...chartBase,
                xType: 'category',
                yLog: state.logY,
            };
        } else if (requestedGraphType === 'scatter') {
            chartType = 'scatter';
            chartLabels = [];
            const scatter = buildScatter({
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
            });
            datasets = scatter.datasets;
            legendDatasets = scatter.legendDatasets;
            square = !!scatter.square;
            chartMessage = scatter.message || '';
            hideLegend = !!scatter.noLegend;
            opts = {
                xLabel: scatter.xLabel,
                yLabel: scatter.yLabel,
                xLabelDisplay: true,
                yLabelDisplay: true,
                xType: state.logX ? 'logarithmic' : 'linear',
                yType: state.logY ? 'logarithmic' : 'linear',
                // Keep the same fixed card height as other plots; do not force
                // square canvas scaling, which can blur the scatter plot.
                maintainAspectRatio: false,
                xTickFormatter: scatter.xTickFormatter,
                yTickFormatter: scatter.yTickFormatter,
            };
        } else if (requestedGraphType === 'cactus') {
            chartType = 'line';
            const cactus = buildCactusDatasets({
                metricLabel,
                seriesKeys,
                seriesLabelMap,
                xKeys,
                lookup,
                compareLookup,
                unit,
                colorForSeries,
                state,
            });
            chartLabels = [];
            datasets = cactus.datasets;
            opts = {
                xLabel: 'Jobs finished',
                yLabel: unit,
                yUnit: unit,
                xType: state.logX ? 'logarithmic' : 'linear',
                yType: state.logY ? 'logarithmic' : 'linear',
            };
        } else {
            chartType = 'line';
            datasets = buildLineOrHistogramDatasets({
                asLine: true,
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
            });
            opts = {
                ...chartBase,
                xType: xIsNumeric ? (state.logX && xCanLog ? 'logarithmic' : 'linear') : 'category',
                yLog: state.logY,
                xLabel: xIsNumeric ? String(xSource) : undefined,
            };
        }

        if (chartMessage) {
            const msg = document.createElement('div');
            msg.className = 'chart-message-box';
            msg.textContent = chartMessage;
            return { datasets: [], legendDatasets: null, chart: null, square, message: chartMessage, placeholder: msg };
        }

        const ch = mkChart(canvas, chartType, chartLabels, datasets, opts);

        // Preserve legend hidden/visible state across chart rebuilds.
        if (hiddenLegend && hiddenLegend.size && ch && Array.isArray(ch.data && ch.data.datasets)) {
            ch.data.datasets.forEach((ds, idx) => {
                if (!ds || ds.__auxiliary) return;
                if (hiddenLegend.has(String(ds.label || ''))) ch.setDatasetVisibility(idx, false);
            });
            try { ch.update(); } catch (e) { }
        }

        const onLegendToggle = ({ label, visible }) => {
            const key = String(label || '');
            if (!key) return;
            let set = state.hiddenLegendByGraph.get(visibilityKey);
            if (!set) {
                set = new Set();
                state.hiddenLegendByGraph.set(visibilityKey, set);
            }
            if (visible) set.delete(key);
            else set.add(key);
        };

        return { datasets, legendDatasets, chart: ch, square, noLegend: hideLegend, onLegendToggle };
    }));

    return grid;
}
