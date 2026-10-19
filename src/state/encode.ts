import { INITIAL_CQL_FRAGMENT } from '../catalog/state.js';
import type { Catalog } from '../catalog/types.js';
import { formatNumber } from '../shared/number.js';
import { coordinateDecimals, escapeToken, escapeValue, toBase64Url } from './format.js';
import { FRAGMENTS_KEY, LAYERS_KEY, RESERVED_KEYS, TOOL_KEY, VIEW_KEY } from './types.js';
import type { PortalState, ViewState } from './types.js';

const encodeView = (view: ViewState): string => {
    const decimals = coordinateDecimals(view.zoom);
    const [lon, lat] = view.center;
    return [
        formatNumber(lat, decimals),
        formatNumber(lon, decimals),
        formatNumber(view.zoom, 1),
        formatNumber(Math.round(view.bearing)),
        formatNumber(Math.round(view.pitch)),
    ].join(',');
};

const encodeLayer = (id: string, state: PortalState): string => {
    const { layers } = state;
    let entry = escapeToken(id);
    if (layers.visible[id] === false) entry += '!';
    const opacity = Math.round((layers.opacity[id] ?? 1) * 100);
    if (opacity !== 100) entry += `:${opacity}`;
    const dimensions = layers.dimensions[id] ?? {};
    for (const name of Object.keys(dimensions).sort()) {
        entry += `~${escapeToken(name)}=${escapeValue(dimensions[name] as string)}`;
    }
    return entry;
};

const layerFragments = (id: string, state: PortalState): [string, string][] => {
    const declared = state.fragments?.[id];
    if (declared) return Object.entries(declared).filter(([, fragment]) => fragment.trim() !== '');
    const cql = state.layers.cql[id];
    return cql ? [[INITIAL_CQL_FRAGMENT, cql]] : [];
};

export const encodeState = (state: PortalState, catalog: Catalog): string => {
    const active = [...new Set(state.layers.active)].filter(id => catalog.get(id) !== undefined);
    const fragments = active.flatMap(id => layerFragments(id, state)
        .map(([name, fragment]) => `${escapeToken(id)}~${escapeToken(name)}:${toBase64Url(fragment.trim())}`));
    const pairs: string[] = [
        `${VIEW_KEY}=${encodeView(state.view)}`,
        `${LAYERS_KEY}=${active.map(id => encodeLayer(id, state)).join(',')}`,
    ];
    if (fragments.length > 0) pairs.push(`${FRAGMENTS_KEY}=${fragments.join(',')}`);
    if (state.tool) pairs.push(`${TOOL_KEY}=${escapeValue(state.tool)}`);
    const extra = Object.entries(state.extra ?? {})
        .filter(([key]) => key !== '' && !RESERVED_KEYS.includes(key))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (const [key, value] of extra) pairs.push(`${escapeToken(key)}=${escapeValue(value)}`);
    return pairs.join('&');
};
