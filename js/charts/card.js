/*
 * card.js
 * Chart card DOM helper that connects draw function and legend wiring.
 */

import { esc } from '../utils/html.js';
import { legendHtml, bindLegendToggle } from './legend.js';

/** Small helper that builds a card DOM node and runs `drawFn` to populate its canvas. */
export function chartCard(titleStr, subStr, heightPx, drawFn) {
    const el = document.createElement('div');
    el.className = 'chart-card';
    el.innerHTML =
        `<div class="chart-title">${esc(titleStr)}</div>` +
        `<div class="chart-sub">${esc(subStr)}</div>` +
        `<div class="chart-wrap" style="height:${heightPx}px"><canvas></canvas></div>` +
        '<div class="leg"></div>';

    const canvas = el.querySelector('canvas');
    const legendEl = el.querySelector('.leg');
    const wrapEl = el.querySelector('.chart-wrap');

    requestAnimationFrame(() => {
        const out = drawFn(canvas);
        if (out && out.placeholder) {
            try { legendEl.remove(); } catch (e) { }
            wrapEl.replaceWith(out.placeholder);
            return;
        }

        const datasets = Array.isArray(out) ? out : (out && Array.isArray(out.datasets) ? out.datasets : null);
        const chart = out && !Array.isArray(out) ? out.chart : null;
        const legendDatasets = out && !Array.isArray(out) && Array.isArray(out.legendDatasets)
            ? out.legendDatasets
            : datasets;

        if (out && out.square) {
            wrapEl.classList.add('square');
            wrapEl.style.height = 'auto';
        }

        if (datasets) {
            if (out && out.noLegend) {
                try { legendEl.remove(); } catch (e) { }
                return;
            }
            legendEl.innerHTML = legendHtml(legendDatasets);
            if (chart) {
                const onLegendToggle = out && !Array.isArray(out) ? out.onLegendToggle : null;
                bindLegendToggle(legendEl, chart, onLegendToggle);
            }
        }
    });

    return el;
}
