/*
 * registry.js
 * Shared chart instance registry for lifecycle operations.
 */

/** All created chart instances are tracked so they can be destroyed on reload. */
export const allCharts = [];

export function addChart(chart) {
    allCharts.push(chart);
}

export function destroyAll() {
    allCharts.forEach(chart => chart.destroy());
    allCharts.length = 0;
}
