/*
 * theme.js
 * Theme switch wiring and chart recoloring hooks.
 */

import { updateChartColors, updateLegends } from '../charts.js';

function applyTheme(button, theme) {
    const isLight = theme === 'light';
    document.body.classList.toggle('light', isLight);

    try {
        // Recompute chart and legend colors against the active CSS variables.
        updateChartColors();
        updateLegends();
    } catch (e) {
        // Non-fatal, keep UI usable even if Chart.js is not ready yet.
    }

    button.textContent = isLight ? '🌞 Light' : '🌙 Dark';
    button.setAttribute('aria-pressed', String(isLight));
}

export function initThemeToggle() {
    const button = document.getElementById('theme-toggle');
    if (!button) return;

    // Keep current app default behavior: load in light mode.
    applyTheme(button, 'light');

    button.addEventListener('click', () => {
        const current = document.body.classList.contains('light') ? 'light' : 'dark';
        const next = current === 'light' ? 'dark' : 'light';
        applyTheme(button, next);
    });
}
