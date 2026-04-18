/*
 * time.js
 * Time-unit conversion and formatting helpers.
 */

/** Select a human-friendly time unit for a median number of nanoseconds. */
export function bestUnit(medianNs) {
    if (medianNs >= 1e9) return 's';
    if (medianNs >= 1e6) return 'ms';
    if (medianNs >= 1e3) return '\u00b5s';
    return 'ns';
}

export const unitDiv = { s: 1e9, ms: 1e6, '\u00b5s': 1e3, ns: 1 };

/** Convert a value in nanoseconds to the requested unit. */
export function toUnit(ns, unit) {
    return ns / (unitDiv[unit] || 1);
}

/** Format nanoseconds into a human string with unit. */
export function fmtNs(ns) {
    const unit = bestUnit(ns);
    return toUnit(ns, unit).toFixed(3) + ' ' + unit;
}
