/*
 * mapping-studio.js
 * Build and manage mapping studio UI and token role interactions.
 */

import {
    roleClass,
    roleBadge,
    normalizeRoles as normalizeRoleAssignments,
} from './role-mapping.js';

export function createMappingStudio({
    group,
    sampleSegments,
    maxSegments,
    initialMetric,
    onApplyRoles,
}) {
    const mappingControls = document.createElement('div');
    mappingControls.className = 'mapping-studio';

    const content = document.createElement('div');

    const studioHead = document.createElement('div');
    studioHead.className = 'mapping-head';
    studioHead.innerHTML =
        '<div class="mapping-head-main">' +
        '<div class="mapping-title">Name Mapping Studio</div>' +
        '<div class="mapping-sub">Click each token and assign role.</div>' +
        '</div>';
    mappingControls.appendChild(studioHead);

    const headTools = document.createElement('div');
    headTools.className = 'mapping-head-tools';
    studioHead.appendChild(headTools);

    const metricWrap = document.createElement('label');
    metricWrap.className = 'mapping-ydata';
    metricWrap.innerHTML = '<span>Y data</span>';

    const metricSel = document.createElement('select');
    [
        { value: 'real_time_ns', text: 'Wall time' },
        { value: 'cpu_time_ns', text: 'CPU time' },
    ].forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.text;
        metricSel.appendChild(opt);
    });
    metricSel.value = initialMetric;
    metricSel.title = 'Choose the metric used on chart Y axis and summaries';
    metricWrap.appendChild(metricSel);
    headTools.appendChild(metricWrap);

    const roleLegend = document.createElement('div');
    roleLegend.className = 'mapping-role-legend';
    roleLegend.innerHTML =
        '<span class="role-pill role-subtype">Subtype N</span>' +
        '<span class="role-pill role-series">Series</span>' +
        '<span class="role-pill role-x">X axis</span>';
    mappingControls.appendChild(roleLegend);

    const sampleEl = document.createElement('div');
    sampleEl.className = 'mapping-example';
    sampleEl.textContent = sampleSegments.length ? `${group}/${sampleSegments.join('/')}` : group;
    mappingControls.appendChild(sampleEl);

    const examplePicker = document.createElement('div');
    examplePicker.className = 'mapping-example-picker';
    mappingControls.appendChild(examplePicker);

    const actionRow = document.createElement('div');
    actionRow.className = 'mapping-actions';
    headTools.appendChild(actionRow);

    const resetRolesBtn = document.createElement('button');
    resetRolesBtn.type = 'button';
    resetRolesBtn.className = 'file-btn';
    resetRolesBtn.textContent = 'Reset mapping';
    resetRolesBtn.title = 'Reset token role mapping to automatic defaults';
    actionRow.appendChild(resetRolesBtn);

    const editLabelsBtn = document.createElement('button');
    editLabelsBtn.type = 'button';
    editLabelsBtn.className = 'file-btn';
    editLabelsBtn.textContent = 'Edit labels';
    editLabelsBtn.title = 'Edit displayed labels for X and series values';
    actionRow.appendChild(editLabelsBtn);

    let roleAssignments = Array.from({ length: maxSegments }, (_, i) => `subtype${i + 1}`);

    function closeRolePopover() {
        document.querySelectorAll('.mapping-role-pop').forEach(el => el.remove());
    }

    function syncExampleTokenStyles() {
        const tokens = examplePicker.querySelectorAll('.example-token-btn');
        tokens.forEach((token, i) => {
            const role = roleAssignments[i] || `subtype${i + 1}`;
            token.classList.remove('role-subtype', 'role-series', 'role-x', 'role-ignore');
            token.classList.add(roleClass(role));
            const badge = roleBadge(role);
            if (badge) token.setAttribute('data-role-label', badge);
            else token.removeAttribute('data-role-label');
        });
    }

    function setRoleAssignments(roles) {
        roleAssignments = normalizeRoleAssignments(maxSegments, [...roles]);
        syncExampleTokenStyles();
    }

    function getRoleAssignments() {
        return [...roleAssignments];
    }

    function roleOptions() {
        const opts = [];
        for (let i = 1; i <= Math.max(1, maxSegments); i += 1) {
            opts.push([`subtype${i}`, `Subtype ${i}`]);
        }
        opts.push(['series', 'Series']);
        opts.push(['x', 'X axis']);
        return opts;
    }

    function openRolePopover(idx, anchor) {
        closeRolePopover();
        const pop = document.createElement('div');
        pop.className = 'mapping-role-pop';
        const current = roleAssignments[idx] || `subtype${idx + 1}`;

        roleOptions().forEach(([value, text]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `mapping-role-pop-btn ${roleClass(value)}` + (value === current ? ' active' : '');
            btn.textContent = text;
            btn.title = `Assign token as ${text}`;
            btn.addEventListener('click', () => {
                const next = [...roleAssignments];
                const curr = next[idx];
                // If target role is already assigned, swap the two token roles.
                if (value !== curr) {
                    const otherIdx = next.findIndex(r => r === value);
                    if (otherIdx !== -1) next[otherIdx] = curr;
                }
                next[idx] = value;
                onApplyRoles(next);
                closeRolePopover();
            });
            pop.appendChild(btn);
        });

        document.body.appendChild(pop);
        const rect = anchor.getBoundingClientRect();
        pop.style.left = `${rect.left + window.scrollX}px`;
        pop.style.top = `${rect.bottom + window.scrollY + 6}px`;

        const onDocClick = e => {
            if (!pop.contains(e.target) && e.target !== anchor) {
                pop.remove();
                document.removeEventListener('mousedown', onDocClick);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', onDocClick), 0);
    }

    function renderExamplePicker() {
        examplePicker.innerHTML = '';
        const prefix = document.createElement('span');
        prefix.className = 'example-prefix';
        prefix.textContent = group;
        examplePicker.appendChild(prefix);

        if (!maxSegments) return;
        for (let i = 0; i < maxSegments; i += 1) {
            const sep = document.createElement('span');
            sep.className = 'example-sep';
            sep.textContent = '/';
            examplePicker.appendChild(sep);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'example-token-btn role-subtype';
            btn.textContent = sampleSegments[i] != null && sampleSegments[i] !== '' ? sampleSegments[i] : `seg[${i}]`;
            btn.title = 'Click to assign role';
            btn.addEventListener('click', () => openRolePopover(i, btn));
            examplePicker.appendChild(btn);
        }

        syncExampleTokenStyles();
    }

    return {
        mappingControls,
        content,
        metricSel,
        resetRolesBtn,
        editLabelsBtn,
        getRoleAssignments,
        setRoleAssignments,
        renderExamplePicker,
    };
}
