/*
 * graph-studio.js
 * Build graph display controls (type and log-axis toggles).
 */

import { openScatterPairPrompt } from './scatter-prompt.js';

export function buildGraphDisplayStudio({ state, scatterOptions, xLogAvailable, render }) {
    const studio = document.createElement('div');
    studio.className = 'mapping-studio graph-display-studio';

    const head = document.createElement('div');
    head.className = 'mapping-head';
    head.innerHTML =
        `<div class="mapping-head-main">` +
        `<div class="mapping-title">Graph Display Studio</div>` +
        `<div class="mapping-sub">Choose which graph cards are visible and how they are drawn.</div>` +
        `</div>`;
    studio.appendChild(head);

    const tools = document.createElement('div');
    tools.className = 'mapping-head-tools';
    head.appendChild(tools);

    const toggleBar = document.createElement('div');
    toggleBar.className = 'graph-toggle-row';
    tools.appendChild(toggleBar);

    function addToggleSwitch(label, key, title, disabled = false) {
        const wrap = document.createElement('label');
        wrap.className = 'graph-toggle-switch';
        if (disabled) wrap.classList.add('disabled');

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!state[key];
        input.disabled = disabled;
        input.title = title;
        input.addEventListener('change', () => {
            state[key] = input.checked;
            render();
        });

        const track = document.createElement('span');
        track.className = 'graph-toggle-track';
        const thumb = document.createElement('span');
        thumb.className = 'graph-toggle-thumb';
        track.appendChild(thumb);

        const text = document.createElement('span');
        text.className = 'graph-toggle-text';
        text.textContent = label;

        wrap.appendChild(input);
        wrap.appendChild(track);
        wrap.appendChild(text);
        toggleBar.appendChild(wrap);
    }

    addToggleSwitch('Log x', 'logX', xLogAvailable
        ? 'Use a logarithmic x axis when the x data are numeric and positive'
        : 'Log x is available only when the x data are numeric', !xLogAvailable);
    if (!xLogAvailable) state.logX = false;
    addToggleSwitch('Log y', 'logY', 'Use a logarithmic y axis');

    const graphWrap = document.createElement('label');
    graphWrap.className = 'mapping-ydata';
    graphWrap.innerHTML = '<span>Graph type</span>';
    const graphSel = document.createElement('select');
    const scatterRepickValue = '__scatter_repick__';
    [
        ['line', 'Standard line'],
        ['histogram', 'Histogram'],
        ['scatter', 'Scatter plot'],
        ['cactus', 'Cactus plot'],
    ].forEach(([value, text]) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        if (value === 'scatter' && scatterOptions.length < 2) opt.disabled = true;
        graphSel.appendChild(opt);
    });

    // Hidden sentinel value used only while scatter is active.
    // It lets selecting visible "Scatter plot" fire `change` again so
    // users can re-open the pair prompt without a separate button.
    const repickOpt = document.createElement('option');
    repickOpt.value = scatterRepickValue;
    repickOpt.textContent = 'Scatter plot';
    repickOpt.hidden = true;
    graphSel.appendChild(repickOpt);

    if (state.graphType === 'scatter' && scatterOptions.length >= 2) {
        graphSel.value = scatterRepickValue;
    } else {
        graphSel.value = state.graphType;
        if (state.graphType === 'scatter' && scatterOptions.length < 2) graphSel.value = 'line';
    }
    graphSel.title = 'Choose graph type';
    graphSel.addEventListener('change', () => {
        const nextType = graphSel.value;
        const prevType = state.graphType;

        if (nextType === scatterRepickValue) {
            graphSel.value = prevType === 'scatter' ? scatterRepickValue : prevType;
            return;
        }

        // Open chooser only when scatter is actually selected.
        // Keep current chart displayed until user confirms the pair.
        if (nextType === 'scatter' && scatterOptions.length > 2) {
            graphSel.value = prevType === 'scatter' ? scatterRepickValue : prevType;
            openScatterPairPrompt({
                state,
                seriesOptions: scatterOptions,
                onApply: () => {
                    state.graphType = 'scatter';
                    graphSel.value = scatterRepickValue;
                    render();
                },
                onCancel: () => {
                    graphSel.value = state.graphType === 'scatter' ? scatterRepickValue : state.graphType;
                },
                onRender: render,
            });
            return;
        }

        state.graphType = nextType;
        render();
    });
    graphWrap.appendChild(graphSel);
    tools.appendChild(graphWrap);

    if (state.graphType === 'scatter' && scatterOptions.length < 2) {
        const note = document.createElement('div');
        note.className = 'mapping-sub';
        note.style.marginTop = '6px';
        note.textContent = 'Scatter plot needs at least two labels.';
        studio.appendChild(note);
    }

    return studio;
}
