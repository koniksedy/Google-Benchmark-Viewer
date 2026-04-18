/*
 * html.js
 * Helpers for safely producing HTML text.
 */

/** Escape a string for HTML insertion. */
export function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
