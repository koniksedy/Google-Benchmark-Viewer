/*
 * legend.js
 * Legend rendering and interactive visibility toggles.
 */

import { esc } from '../utils/html.js';
import { getColors } from './theme.js';

/** Update legend swatches (DOM-only helper). */
export function updateLegends() {
    const colors = getColors();
    const legends = document.querySelectorAll('.legend');

    legends.forEach(legend => {
        const items = legend.querySelectorAll('.legend-item');
        items.forEach((item, index) => {
            const dot = item.querySelector('.legend-dot');
            if (!dot) return;

            // Prefer explicit palette index on legend items for stable theme remaps.
            const paletteAttr = item.getAttribute('data-legend-palette-index');
            const paletteIdx = paletteAttr && paletteAttr !== '' ? Number(paletteAttr) : null;
            const color = Number.isFinite(paletteIdx) ? colors[paletteIdx % colors.length] : colors[index % colors.length];
            const mode = item.getAttribute('data-legend-mode') || 'solid';

            // Reset style so mode switches do not keep stale visual artifacts.
            dot.style.background = 'transparent';
            dot.style.backgroundImage = 'none';
            dot.style.border = 'none';
            dot.style.width = '10px';
            dot.style.height = '10px';
            dot.style.display = '';
            dot.style.verticalAlign = '';
            dot.style.borderRadius = '2px';

            if (mode === 'hatch') {
                dot.style.backgroundImage = `repeating-linear-gradient(45deg, ${color} 0, ${color} 1px, transparent 1px, transparent 4px)`;
                dot.style.border = `1px solid ${color}`;
            } else if (mode === 'dashed') {
                dot.style.border = `2px dashed ${color}`;
                dot.style.width = '12px';
                dot.style.height = '8px';
                dot.style.display = 'inline-block';
                dot.style.verticalAlign = 'middle';
            } else {
                dot.style.backgroundColor = color;
            }
        });
    });
}

/** Return HTML for a small legend for the supplied datasets. */
export function legendHtml(datasets) {
    const colors = getColors();
    const visibleDatasets = (datasets || []).filter(ds => !(ds && ds.__auxiliary));

    return '<div class="legend">' +
        visibleDatasets.map((ds, index) => {
            const color = (ds && ds.borderColor && typeof ds.borderColor === 'string')
                ? ds.borderColor
                : colors[index % colors.length];
            const isCompare = !!(ds && ds.__compare);
            const mode = isCompare && ds && ds.__hatch
                ? 'hatch'
                : (isCompare && ds && ds.__dashed ? 'dashed' : 'solid');
            const tip = isCompare && ds.__hatch
                ? `${ds.label} (compare, hatched)`
                : (isCompare && ds.__dashed
                    ? `${ds.label} (compare, dashed)`
                    : String(ds && ds.label || 'Series'));

            let dotHtml = '';
            if (isCompare && ds && ds.__hatch) {
                const c = color;
                dotHtml = `<span class="legend-dot" style="background-image:repeating-linear-gradient(45deg, ${c} 0, ${c} 1px, transparent 1px, transparent 4px); border:1px solid ${c}"></span>`;
            } else if (isCompare && ds && ds.__dashed) {
                dotHtml = `<span class="legend-dot" style="background:transparent; border:2px dashed ${color}; width:12px; height:8px; display:inline-block; vertical-align:middle; border-radius:2px"></span>`;
            } else {
                dotHtml = `<span class="legend-dot" style="background:${color}"></span>`;
            }

            const paletteMeta = (ds && Number.isFinite(ds.__paletteIdx)) ? ` data-legend-palette-index="${ds.__paletteIdx}"` : '';
            return `<span class="legend-item" data-ds-index="${index}" data-legend-mode="${mode}"${paletteMeta} title="${esc(tip)}">${dotHtml}${esc(ds.label)}</span>`;
        }).join('') + '</div>';
}

export function bindLegendToggle(legendEl, chart, onToggle) {
    if (!legendEl || !chart) return;
    const items = legendEl.querySelectorAll('.legend-item[data-ds-index]');

    items.forEach(item => {
        const index = Number(item.getAttribute('data-ds-index'));
        if (!Number.isFinite(index)) return;

        item.style.cursor = 'pointer';
        item.classList.toggle('off', !chart.isDatasetVisible(index));
        item.addEventListener('click', () => {
            const isVisible = chart.isDatasetVisible(index);
            chart.setDatasetVisibility(index, !isVisible);
            item.classList.toggle('off', isVisible);
            try { chart.update(); } catch (e) { }

            if (typeof onToggle === 'function') {
                const ds = chart.data && Array.isArray(chart.data.datasets) ? chart.data.datasets[index] : null;
                const label = ds && ds.label != null ? String(ds.label) : '';
                onToggle({
                    index,
                    label,
                    visible: !isVisible,
                });
            }
        });
    });
}
