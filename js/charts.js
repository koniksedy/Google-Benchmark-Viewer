/*
 * charts.js
 * Public chart helpers re-exported from focused chart modules.
 */

import { applyChartDefaults } from './charts/theme.js';

export { allCharts, destroyAll } from './charts/registry.js';
export { getColors, getMuted, getGridColor, updateChartColors } from './charts/theme.js';
export { mkChart } from './charts/mk-chart.js';
export { updateLegends, legendHtml } from './charts/legend.js';
export { chartCard } from './charts/card.js';

applyChartDefaults();
