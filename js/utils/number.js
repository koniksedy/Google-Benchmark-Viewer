/*
 * number.js
 * Numeric parsing and presentation helpers.
 */

/** Convert a value to a finite number when possible; otherwise return null. */
export function parseNumericValue(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    return Number.isFinite(n) ? n : null;
}

/** Format a number with apostrophe thousand separators for axis ticks. */
export function fmtTickNumber(v) {
    if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return String(v);
    const n = Number(v);
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    const [intPart, fracPart] = String(abs).split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
    return sign + grouped + (fracPart ? '.' + fracPart : '');
}

/** Format numeric values for tooltips/axes. */
export function fmtVal(v, unit) {
    if (v === null || v === undefined || isNaN(v)) return '\u2014';
    if (!unit) return v.toFixed(3);
    if (unit === '\u00d7') return v.toFixed(1) + '\u00d7';
    if (unit === 'GB/s') return v.toFixed(2) + ' GB/s';
    if (unit === 'M/s') return v.toFixed(1) + ' M/s';
    return v.toFixed(3) + ' ' + unit;
}

/** Format large counts (iterations) into a compact string. */
export function fmtCount(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
}
