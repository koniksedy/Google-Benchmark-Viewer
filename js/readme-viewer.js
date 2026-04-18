const content = document.getElementById('readme-content');

async function loadMarkdown() {
    try {
        const response = await fetch('README.md', { cache: 'no-store' });
        if (!response.ok) return { md: '', error: `HTTP ${response.status} ${response.statusText}` };
        const text = await response.text();
        return { md: text };
    } catch (err) {
        return { md: '', error: err && err.message ? String(err.message) : 'Unknown error' };
    }
}

function applyMarkdown(result) {
    if (!content) {
        console.warn('readme-content element not found');
        return;
    }

    if (!result || !result.md) {
        const msg = result && result.error
            ? `README.md could not be loaded: ${result.error}`
            : 'README.md could not be loaded.';
        content.innerHTML = `<div class="readme-error"><p>${msg}</p><p>Serve the folder with a static server (for example: <code>python3 -m http.server 8000</code>) and reload the page.</p></div>`;
        console.error(msg);
        return;
    }

    const html = window.marked ? window.marked.parse(result.md, { gfm: true, breaks: false }) : result.md;
    content.innerHTML = html;
}

async function init() {
    const result = await loadMarkdown();
    applyMarkdown(result);
}

init();
