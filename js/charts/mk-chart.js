/*
 * mk-chart.js
 * Chart.js instance creation and base axis/dataset setup.
 */

import { fmtVal, fmtTickNumber } from '../utils/number.js';
import { addChart } from './registry.js';
import { getColors, getMuted, getGridColor } from './theme.js';

/**
 * Create a Chart.js chart mounted on `canvas`.
 * Returns the created Chart instance.
 */
export function mkChart(canvas, type, labels, datasets, opts) {
    const colors = getColors();
    const muted = getMuted();
    const gridColor = getGridColor();
    const xTickFormatter = opts && typeof opts.xTickFormatter === 'function' ? opts.xTickFormatter : null;
    const yTickFormatter = opts && typeof opts.yTickFormatter === 'function' ? opts.yTickFormatter : null;

    const xScale = {
        title: { display: !!(opts && opts.xLabelDisplay), text: opts && opts.xLabel, color: muted },
        grid: { color: gridColor },
        ticks: { autoSkip: false, maxRotation: 40, color: muted },
        ...(opts && opts.xType ? { type: opts.xType } : {}),
        ...(opts && opts.xMin != null ? { min: opts.xMin } : {}),
        ...(opts && opts.xMax != null ? { max: opts.xMax } : {}),
    };

    if (xTickFormatter) {
        xScale.ticks = {
            ...xScale.ticks,
            callback: value => xTickFormatter(value),
        };
    } else if (opts && (opts.xType === 'linear' || opts.xType === 'logarithmic')) {
        xScale.ticks = {
            ...xScale.ticks,
            callback: value => fmtTickNumber(value),
        };
    }

    const yScale = {
        title: { display: !!(opts && opts.yLabel), text: opts && opts.yLabel, color: muted },
        grid: { color: gridColor },
        ticks: { callback: value => fmtVal(value, opts && opts.yUnit), color: muted },
        ...(opts && opts.yType ? { type: opts.yType } : {}),
        ...(opts && opts.yMin != null ? { min: opts.yMin } : {}),
        ...(opts && opts.yMax != null ? { max: opts.yMax } : {}),
    };

    if (opts && opts.xLog) xScale.type = 'logarithmic';
    if (opts && opts.yLog) yScale.type = 'logarithmic';

    if (yTickFormatter) {
        yScale.ticks = {
            ...yScale.ticks,
            callback: value => yTickFormatter(value),
        };
    }

    const chart = new Chart(canvas, {
        type,
        data: {
            labels,
            datasets: datasets.map((dataset, index) => {
                const source = { ...(dataset || {}) };
                const paletteIdx = Number.isFinite(source.__paletteIdx) ? source.__paletteIdx : index;
                const color = colors[paletteIdx % colors.length];

                // If backgroundColor is a non-string (e.g. CanvasPattern), keep it.
                const background = (source.backgroundColor && typeof source.backgroundColor !== 'string')
                    ? source.backgroundColor
                    : (typeof source.backgroundColor === 'string' ? source.backgroundColor : (type === 'line' ? color + '22' : color + 'bb'));

                return {
                    // Keep color tied to palette index so theme changes stay consistent.
                    ...source,
                    borderColor: color,
                    backgroundColor: background,
                    borderWidth: source.borderWidth != null ? source.borderWidth : (type === 'line' ? 2 : 1),
                    pointRadius: source.pointRadius != null ? source.pointRadius : 3,
                    tension: source.tension != null ? source.tension : 0.3,
                    fill: source.fill != null ? source.fill : false,
                };
            }),
        },
        options: {
            responsive: true,
            maintainAspectRatio: !!(opts && opts.maintainAspectRatio),
            aspectRatio: opts && opts.aspectRatio ? opts.aspectRatio : 2,
            animation: { duration: 300 },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${fmtVal(ctx.parsed.y, opts.yUnit)}`,
                    },
                },
            },
            scales: {
                x: xScale,
                y: yScale,
            },
        },
    });

    // Ensure auxiliary diagonal datasets span current chart scales.
    try {
        chart.data.datasets.forEach(dataset => {
            if (!dataset || !dataset.__auxiliary) return;
            if (chart.scales && chart.scales.x && chart.scales.y && Array.isArray(dataset.data) && dataset.data.length >= 2) {
                const xMin = chart.scales.x.min;
                const xMax = chart.scales.x.max;
                const yMin = chart.scales.y.min;
                const yMax = chart.scales.y.max;
                const low = Math.min(xMin, yMin);
                const high = Math.max(xMax, yMax);
                dataset.data[0] = { x: low, y: low };
                dataset.data[1] = { x: high, y: high };
            }
        });
        chart.update();
    } catch (e) { /* non-fatal */ }

    addChart(chart);
    return chart;
}
