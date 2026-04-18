/*
 * state.js
 * Central mutable state for the currently loaded benchmark view.
 */

export function createViewerState() {
    return {
        baseData: null,
        compareByGroup: new Map(),
        compareTimestamp: null,
    };
}

export function clearCompare(state) {
    state.compareByGroup = new Map();
    state.compareTimestamp = null;
}

export function resetState(state) {
    state.baseData = null;
    clearCompare(state);
}
