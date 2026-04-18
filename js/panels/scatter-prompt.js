/*
 * scatter-prompt.js
 * Modal prompt for choosing X/Y series labels for scatter plots.
 */

export function openScatterPairPrompt({ state, seriesOptions, onApply = null, onCancel = null, onRender = null }) {
    if (state.scatterPairPrompting) return;
    state.scatterPairPrompting = true;

    const normalizedOptions = [];
    const seenSeriesValues = new Set();
    (Array.isArray(seriesOptions) ? seriesOptions : []).forEach(opt => {
        const valueRaw = (opt && typeof opt === 'object' && 'value' in opt) ? opt.value : opt;
        const value = valueRaw == null ? '' : String(valueRaw);
        if (seenSeriesValues.has(value)) return;
        seenSeriesValues.add(value);

        const labelRaw = (opt && typeof opt === 'object' && 'label' in opt) ? opt.label : value;
        const label = (labelRaw == null || String(labelRaw) === '') ? '(none)' : String(labelRaw);
        normalizedOptions.push({ value, label });
    });
    const seriesVals = normalizedOptions.map(o => o.value);

    const overlay = document.createElement('div');
    overlay.className = 'scatter-pair-overlay';

    const box = document.createElement('div');
    box.className = 'scatter-pair-dialog';
    box.innerHTML = '<h3>Select two labels for the scatter plot</h3>';

    const desc = document.createElement('p');
    desc.className = 'scatter-pair-desc';
    desc.textContent = 'Pick the two series labels to compare on the X and Y axes.';
    box.appendChild(desc);

    const row = document.createElement('div');
    row.className = 'scatter-pair-fields';

    const makeField = (labelText, value) => {
        const wrap = document.createElement('label');
        wrap.className = 'scatter-pair-field';
        const span = document.createElement('span');
        span.textContent = labelText;
        const sel = document.createElement('select');
        normalizedOptions.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            sel.appendChild(opt);
        });
        sel.value = value;
        wrap.appendChild(span);
        wrap.appendChild(sel);
        return { wrap, sel };
    };

    const initialPair = Array.isArray(state.scatterPair) && state.scatterPair.length === 2
        ? state.scatterPair
        : [seriesVals[0], seriesVals[1]];
    const xField = makeField('X label', initialPair[0]);
    const yField = makeField('Y label', initialPair[1]);
    row.appendChild(xField.wrap);
    row.appendChild(yField.wrap);
    box.appendChild(row);

    const actions = document.createElement('div');
    actions.className = 'scatter-pair-actions';

    const err = document.createElement('div');
    err.className = 'mapping-sub';
    err.style.marginTop = '2px';
    err.style.marginBottom = '6px';
    err.style.color = 'var(--delta-worse-color)';
    err.style.display = 'none';
    err.textContent = 'Select two different labels for X and Y.';
    box.appendChild(err);

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'file-btn';
    apply.textContent = 'Apply';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'file-btn';
    cancel.textContent = 'Cancel';

    actions.appendChild(apply);
    actions.appendChild(cancel);
    box.appendChild(actions);

    function close(setPair = false) {
        state.scatterPairPrompting = false;
        try { overlay.remove(); } catch (e) { }
        if (!setPair && state.graphType === 'scatter' && seriesVals.length >= 2) {
            state.graphType = 'line';
        }
    }

    apply.addEventListener('click', () => {
        const x = xField.sel.value;
        const y = yField.sel.value;
        if (x === y) {
            err.style.display = 'block';
            return;
        }

        err.style.display = 'none';
        state.scatterPair = [x, y];
        close(true);

        if (typeof onApply === 'function') onApply([x, y]);
        else if (typeof onRender === 'function') onRender();
    });

    cancel.addEventListener('click', () => {
        close(false);
        if (typeof onCancel === 'function') onCancel();
        else if (typeof onRender === 'function') onRender();
    });

    overlay.addEventListener('click', e => {
        if (e.target !== overlay) return;
        close(false);
        if (typeof onCancel === 'function') onCancel();
        else if (typeof onRender === 'function') onRender();
    });

    overlay.appendChild(box);
    document.body.appendChild(overlay);
}
