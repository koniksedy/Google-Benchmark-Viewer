/*
 * theme.js
 * Theme switch wiring and chart recoloring hooks.
 */

import { updateChartColors, updateLegends } from '../charts.js';

const THEME_STORAGE_KEY = 'viewer-theme';

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

    // Keep theme in sync across index and readme pages.
    try {
        localStorage.setItem(THEME_STORAGE_KEY, isLight ? 'light' : 'dark');
    } catch (e) {
        // Ignore storage failures (private mode / blocked storage).
    }
}

export function initThemeToggle() {
    const button = document.getElementById('theme-toggle');
    if (!button) return;

    let initialTheme = 'light';
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') initialTheme = stored;
    } catch (e) {
        // Fallback keeps default light mode.
    }

    applyTheme(button, initialTheme);

    button.addEventListener('click', () => {
        const current = document.body.classList.contains('light') ? 'light' : 'dark';
        const next = current === 'light' ? 'dark' : 'light';
        applyTheme(button, next);
    });
}
