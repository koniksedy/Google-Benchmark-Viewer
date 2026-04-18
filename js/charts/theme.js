/*
 * theme.js
 * Theme-driven palette and chart color updates.
 */

import { allCharts } from './registry.js';

const FALLBACK_MUTED = '#5c6880';
const FALLBACK_GRID = 'rgba(35,44,62,0.8)';

// Build a palette on demand so the first color follows the active theme accent.
export function getColors() {
    const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#4af0c4';
    return [accent, '#f06060', '#f0c040', '#60a8f0', '#c060f0', '#f08040', '#60e060', '#f060c0', '#80c0ff', '#ffb060'];
}

export function getMuted() {
    const value = getComputedStyle(document.body).getPropertyValue('--muted').trim();
    return value || FALLBACK_MUTED;
}

function hexToRgb(hex) {
    const value = String(hex || '').trim().replace('#', '');
    if (/^[0-9a-fA-F]{3}$/.test(value)) {
        return {
            r: parseInt(value[0] + value[0], 16),
            g: parseInt(value[1] + value[1], 16),
            b: parseInt(value[2] + value[2], 16),
        };
    }

    if (/^[0-9a-fA-F]{6}$/.test(value)) {
        return {
            r: parseInt(value.slice(0, 2), 16),
            g: parseInt(value.slice(2, 4), 16),
            b: parseInt(value.slice(4, 6), 16),
        };
    }

    return null;
}

export function getGridColor() {
    const muted = getMuted();
    const rgb = hexToRgb(muted);
    if (!rgb) return FALLBACK_GRID;
    return `rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`;
}

export function applyChartDefaults() {
    Chart.defaults.font.family = "'DM Mono', monospace";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = getMuted();
    Chart.defaults.borderColor = getGridColor();
}

/** Update dataset colors for existing charts (useful on theme change). */
export function updateChartColors() {
    const colors = getColors();
    const muted = getMuted();
    const gridColor = getGridColor();
    Chart.defaults.color = muted;
    Chart.defaults.borderColor = gridColor;

    for (const chart of allCharts) {
        chart.data.datasets.forEach((ds, index) => {
            if (ds && ds.__auxiliary) {
                const auxPaletteIdx = Number.isFinite(ds.__paletteIdx) ? ds.__paletteIdx : index;
                ds.borderColor = colors[auxPaletteIdx % colors.length];
                if (typeof ds.backgroundColor === 'string' && ds.backgroundColor !== 'transparent') {
                    ds.backgroundColor = colors[auxPaletteIdx % colors.length] + '22';
                }
                return;
            }

            const paletteIdx = ds && Number.isFinite(ds.__paletteIdx) ? ds.__paletteIdx : index;
            const color = colors[paletteIdx % colors.length];
            ds.borderColor = color;

            // Keep non-string backgrounds (CanvasPattern) as-is.
            if (!(ds && ds.backgroundColor && typeof ds.backgroundColor !== 'string')) {
                ds.backgroundColor = chart.config.type === 'line' ? color + '22' : color + 'bb';
            }
        });

        if (chart.options && chart.options.scales) {
            if (chart.options.scales.x) {
                if (chart.options.scales.x.grid) chart.options.scales.x.grid.color = gridColor;
                if (chart.options.scales.x.ticks) chart.options.scales.x.ticks.color = muted;
                if (chart.options.scales.x.title) chart.options.scales.x.title.color = muted;
            }
            if (chart.options.scales.y) {
                if (chart.options.scales.y.grid) chart.options.scales.y.grid.color = gridColor;
                if (chart.options.scales.y.ticks) chart.options.scales.y.ticks.color = muted;
                if (chart.options.scales.y.title) chart.options.scales.y.title.color = muted;
            }
        }

        try { chart.update(); } catch (e) { }
    }
}
