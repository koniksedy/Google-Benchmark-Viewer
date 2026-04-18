/*
 * role-mapping.js
 * Helpers for token role assignment in the mapping studio.
 */

export function roleClass(role) {
    if (role && role.startsWith('subtype')) return 'role-subtype';
    if (role === 'series') return 'role-series';
    if (role === 'x') return 'role-x';
    return 'role-subtype';
}

export function roleBadge(role) {
    if (!role || !role.startsWith('subtype')) return '';
    const match = role.match(/^subtype(\d+)$/);
    return match ? `S${match[1]}` : 'S';
}

export function normalizeRoles(maxSegments, roles) {
    const inRoles = Array.from({ length: maxSegments }, (_, i) => roles[i] || `subtype${i + 1}`);
    let xIdx = inRoles.findIndex(r => r === 'x');
    let seriesIdx = inRoles.findIndex((r, i) => r === 'series' && i !== xIdx);
    if (seriesIdx === xIdx) seriesIdx = -1;

    const out = Array.from({ length: maxSegments }, () => '');
    if (xIdx >= 0) out[xIdx] = 'x';
    if (seriesIdx >= 0) out[seriesIdx] = 'series';

    const subtypeCandidates = [];
    for (let i = 0; i < maxSegments; i += 1) {
        if (out[i]) continue;
        const match = String(inRoles[i]).match(/^subtype(\d+)$/);
        subtypeCandidates.push({ i, lvl: match ? Number(match[1]) : Number.POSITIVE_INFINITY });
    }
    subtypeCandidates.sort((a, b) => (a.lvl === b.lvl ? a.i - b.i : a.lvl - b.lvl));
    subtypeCandidates.forEach((candidate, idx) => {
        out[candidate.i] = `subtype${idx + 1}`;
    });

    return out;
}

export function buildAutoRoles(maxSegments, segmentValues) {
    const roles = Array.from({ length: maxSegments }, (_, i) => `subtype${i + 1}`);

    const varying = [];
    for (let i = 0; i < maxSegments; i += 1) {
        const vals = [...segmentValues[i]].filter(v => v !== '');
        if (vals.length > 1) {
            varying.push({
                idx: i,
                allNumeric: vals.every(v => !isNaN(Number(v))),
            });
        }
    }

    if (!varying.length) return normalizeRoles(maxSegments, roles);

    let xIdx = -1;
    for (let i = varying.length - 1; i >= 0; i -= 1) {
        if (varying[i].allNumeric) {
            xIdx = varying[i].idx;
            break;
        }
    }
    if (xIdx < 0) xIdx = varying[varying.length - 1].idx;

    const pre = varying.filter(v => v.idx !== xIdx).map(v => v.idx);
    let seriesIdx = -1;
    if (pre.length) seriesIdx = pre[pre.length - 1];

    const subtypeIdxs = pre.slice(0, -1).sort((a, b) => a - b);
    subtypeIdxs.forEach((idx, n) => {
        roles[idx] = `subtype${n + 1}`;
    });

    if (seriesIdx >= 0) roles[seriesIdx] = 'series';
    if (xIdx >= 0) roles[xIdx] = 'x';

    return normalizeRoles(maxSegments, roles);
}

export function rolesFromState(maxSegments, state) {
    const roles = Array.from({ length: maxSegments }, (_, i) => `subtype${i + 1}`);

    state.subtypeDefs.forEach(({ idx, level }) => {
        if (idx >= 0 && idx < maxSegments) roles[idx] = `subtype${level}`;
    });

    if (state.seriesSource.startsWith('seg:')) {
        const i = Number(state.seriesSource.slice(4));
        if (!isNaN(i) && i >= 0 && i < maxSegments) roles[i] = 'series';
    }

    if (state.xSource.startsWith('seg:')) {
        const i = Number(state.xSource.slice(4));
        if (!isNaN(i) && i >= 0 && i < maxSegments) roles[i] = 'x';
    }

    return normalizeRoles(maxSegments, roles);
}
