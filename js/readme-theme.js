// Simple theme toggle for the README page.
// Stores preference in localStorage ('viewer-theme' = 'light'|'dark').

const toggle = document.getElementById('readme-theme-toggle');
if (toggle) {
    const applyState = (isLight) => {
        if (isLight) document.body.classList.add('light');
        else document.body.classList.remove('light');
        toggle.textContent = isLight ? '🌞 Light' : '🌙 Dark';
        toggle.setAttribute('aria-pressed', isLight ? 'true' : 'false');
    };

    // Load stored preference or infer from document.body
    const stored = localStorage.getItem('viewer-theme');
    if (stored === 'light') applyState(true);
    else if (stored === 'dark') applyState(false);

    toggle.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light');
        localStorage.setItem('viewer-theme', isLight ? 'light' : 'dark');
        applyState(isLight);
    });
}
