/*
 * label-editor.js
 * Modal editor for custom X/series label overrides.
 */

import { inferSources, valueForSource, sortLabels } from './source-utils.js';

export function openLabelEditor({ group, runs, state, maxArgs, render }) {
    const subset = runs;
    const inferred = inferSources(subset, state.depth, maxArgs);
    const xSource = state.xSource === 'auto' ? inferred.xSource : state.xSource;
    const seriesSource = state.seriesSource === 'auto' ? inferred.seriesSource : state.seriesSource;

    const xVals = sortLabels(subset.map(r => {
        const v = valueForSource(r, xSource, state.depth, group);
        return v == null ? '' : String(v);
    }));
    const sVals = seriesSource === 'none' ? [] : sortLabels(subset.map(r => {
        const v = valueForSource(r, seriesSource, state.depth, group);
        return v == null ? '' : String(v);
    }));

    const overlay = document.createElement('div');
    overlay.className = 'label-editor-overlay';
    const box = document.createElement('div');
    box.className = 'label-editor';
    box.innerHTML = '<h3>Edit Label Names</h3>';

    function makeSection(title, source, vals) {
        const sec = document.createElement('div');
        sec.className = 'label-section';
        const h = document.createElement('h4');
        h.textContent = title;
        sec.appendChild(h);
        vals.forEach(v => {
            const row = document.createElement('div');
            row.className = 'label-row';
            const k = document.createElement('div');
            k.className = 'label-key';
            k.textContent = v || '(none)';
            const mapKey = `${source}::${v}`;
            const inp = document.createElement('input');
            inp.className = 'label-input';
            inp.value = state.overrides.has(mapKey) ? state.overrides.get(mapKey) : v;
            row.appendChild(k);
            row.appendChild(inp);
            sec.appendChild(row);
        });
        sec.dataset.source = source;
        return sec;
    }

    box.appendChild(makeSection(`X labels (${xSource})`, xSource, xVals));
    if (seriesSource !== 'none') box.appendChild(makeSection(`Series (${seriesSource})`, seriesSource, sVals));

    const actions = document.createElement('div');
    actions.className = 'label-actions';
    const save = document.createElement('button');
    save.className = 'file-btn';
    save.textContent = 'Save';
    const cancel = document.createElement('button');
    cancel.className = 'file-btn';
    cancel.textContent = 'Cancel';
    const reset = document.createElement('button');
    reset.className = 'file-btn';
    reset.textContent = 'Reset';
    actions.appendChild(save);
    actions.appendChild(reset);
    actions.appendChild(cancel);
    box.appendChild(actions);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => {
        if (e.target === overlay) document.body.removeChild(overlay);
    });

    save.addEventListener('click', () => {
        const secs = box.querySelectorAll('.label-section');
        secs.forEach(sec => {
            const source = sec.dataset.source || null;
            if (!source) return;
            sec.querySelectorAll('.label-row').forEach(row => {
                const key = row.querySelector('.label-key').textContent;
                const val = row.querySelector('.label-input').value;
                const mapKey = `${source}::${String(key === '(none)' ? '' : key)}`;
                if (String(val) === String(key) || (key === '(none)' && val === '')) state.overrides.delete(mapKey);
                else state.overrides.set(mapKey, val);
            });
        });
        try {
            const sk = `bench_viewer_overrides:${group}`;
            localStorage.setItem(sk, JSON.stringify(Object.fromEntries(state.overrides)));
        } catch (e) { }
        document.body.removeChild(overlay);
        render();
    });

    cancel.addEventListener('click', () => document.body.removeChild(overlay));
    reset.addEventListener('click', () => {
        for (const k of Array.from(state.overrides.keys())) {
            if (k.startsWith(xSource + '::') || k.startsWith(seriesSource + '::')) state.overrides.delete(k);
        }
        try {
            const sk = `bench_viewer_overrides:${group}`;
            const obj = Object.fromEntries(state.overrides);
            if (Object.keys(obj).length) localStorage.setItem(sk, JSON.stringify(obj));
            else localStorage.removeItem(sk);
        } catch (e) { }
        document.body.removeChild(overlay);
        render();
    });
}
