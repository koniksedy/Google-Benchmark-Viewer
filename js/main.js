/*
 * main.js
 * Entrypoint module: wire DOM events, file reading and app-level flow.
 */

import { groupByPrefix } from './utils/bench.js';
import { normalizeBenchmarks, sharedBenchmarkCount } from './app/benchmark-data.js';
import { initThemeToggle } from './app/theme.js';
import { createViewerState } from './app/state.js';
import { loadIntoViewer, resetViewer, clearCompareAndReload } from './app/viewer-ui.js';

const viewerState = createViewerState();

function readJsonFile(file, onData, onErrorPrefix) {
    const reader = new FileReader();
    reader.onload = e => {
        try {
            onData(JSON.parse(e.target.result));
        } catch (err) {
            alert(`${onErrorPrefix}: ${err.message}`);
        }
    };
    reader.readAsText(file);
}

export function load(data) {
    loadIntoViewer(data, viewerState);
}

function readBenchmarkFile(file) {
    readJsonFile(file, data => {
        load(data);
    }, 'Could not parse JSON');
}

async function pickBenchmarkFile() {
    if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({
            multiple: false,
            startIn: 'documents',
            types: [{
                description: 'Google Benchmark JSON',
                accept: { 'application/json': ['.json'] },
            }],
        });
        if (!handle) return null;
        return handle.getFile();
    }

    return new Promise(resolve => {
        const input = document.getElementById('file-input');
        if (!input) {
            resolve(null);
            return;
        }

        const onChange = () => {
            input.removeEventListener('change', onChange);
            resolve(input.files && input.files[0] ? input.files[0] : null);
        };

        input.addEventListener('change', onChange, { once: true });
        input.value = '';
        input.click();
    });
}

function readCompareFile(file) {
    readJsonFile(file, compareData => {
        if (!viewerState.baseData) {
            alert('Load a base benchmark file first.');
            return;
        }

        const compareRuns = normalizeBenchmarks(compareData);
        if (!compareRuns.length) {
            alert('No non-aggregate benchmark runs found in compare file.');
            return;
        }

        const sharedCount = sharedBenchmarkCount(viewerState.baseData, compareRuns);
        if (!sharedCount) {
            alert('Compare file does not share benchmark names with the loaded base file.');
            return;
        }

        viewerState.compareByGroup = groupByPrefix(compareRuns);
        viewerState.compareTimestamp = compareData.timestamp
            || (compareData.context && compareData.context.date)
            || 'no timestamp';

        if (viewerState.baseData) load(viewerState.baseData);
    }, 'Could not parse compare JSON');
}

function wireFileInputs() {
    const chooseFileBtn = document.getElementById('choose-file-btn');
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');

    if (chooseFileBtn) {
        chooseFileBtn.addEventListener('click', async () => {
            try {
                const file = await pickBenchmarkFile();
                if (file) readBenchmarkFile(file);
            } catch (err) {
                alert(`Could not open file picker: ${err && err.message ? err.message : err}`);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', e => {
            if (e.target.files[0]) readBenchmarkFile(e.target.files[0]);
        });
    }

    dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('over');
        if (e.dataTransfer.files[0]) readBenchmarkFile(e.dataTransfer.files[0]);
    });
}

function wireCompareButton() {
    const compareBtn = document.getElementById('compare-btn');
    const compareFileInput = document.getElementById('compare-file-input');
    if (!compareBtn || !compareFileInput) return;

    compareBtn.addEventListener('click', () => {
        if (viewerState.compareByGroup && viewerState.compareByGroup.size) {
            clearCompareAndReload(viewerState);
            return;
        }
        compareFileInput.click();
    });

    compareFileInput.addEventListener('change', e => {
        if (e.target.files[0]) readCompareFile(e.target.files[0]);
        compareFileInput.value = '';
    });
}

function wireNewViewButton() {
    const newViewBtn = document.getElementById('new-view-btn');
    if (!newViewBtn) return;
    newViewBtn.addEventListener('click', () => resetViewer(viewerState));
}

function bootstrap() {
    wireFileInputs();
    wireCompareButton();
    wireNewViewButton();
    initThemeToggle();

    // expose for debugging
    window._benchviewer = { load };

    // auto-load a sample if provided via global `INITIAL_DATA`
    if (window.INITIAL_DATA) load(window.INITIAL_DATA);
}

bootstrap();
