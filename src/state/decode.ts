import type { LayerStateSnapshot } from '../catalog/state.js';
import type { Catalog } from '../catalog/types.js';
import { and } from '../cql/logic.js';
import { fromBase64Url, splitQuery, unescapeToken } from './format.js';
import { FRAGMENTS_KEY, LAYERS_KEY, RESERVED_KEYS, TOOL_KEY, VIEW_KEY } from './types.js';
import type { PortalState, ViewState } from './types.js';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const NUMBER = /^-?\d+(\.\d+)?$/;

const decodeView = (raw: string): ViewState | null => {
    const parts = raw.split(',');
    if (parts.length < 3 || parts.length > 5 || !parts.every(part => NUMBER.test(part))) return null;
    const [lat, lon, zoom, bearing = 0, pitch = 0] = parts.map(Number) as [number, number, number, number?, number?];
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || zoom < 0 || zoom > 30) return null;
    return { center: [lon, lat], zoom, bearing, pitch: Math.max(0, Math.min(85, pitch)) };
};

const decodeLayers = (raw: string, catalog: Catalog): LayerStateSnapshot => {
    const active: string[] = [];
    const opacity: Record<string, number> = {};
    const visible: Record<string, boolean> = {};
    const dimensions: Record<string, Record<string, string>> = {};
    for (const entry of raw.split(',')) {
        const [head = '', ...rest] = entry.split('~');
        const match = /^([^:!]+)(!)?(?::(\d{1,3}))?$/.exec(head);
        const id = match ? unescapeToken(match[1] as string) : null;
        if (!match || id === null || !catalog.get(id) || active.includes(id)) continue;
        active.push(id);
        if (match[2]) visible[id] = false;
        const value = match[3] === undefined ? 100 : Number(match[3]);
        if (value < 100) opacity[id] = value / 100;
        for (const pair of rest) {
            const at = pair.indexOf('=');
            const name = at > 0 ? unescapeToken(pair.slice(0, at))?.trim().toLowerCase() : null;
            const chosen = at > 0 ? unescapeToken(pair.slice(at + 1))?.trim() : null;
            if (name && chosen) dimensions[id] = { ...dimensions[id], [name]: chosen };
        }
    }
    return { active, opacity, visible, dimensions, cql: {} };
};

const decodeFragments = (raw: string, catalog: Catalog): Record<string, Record<string, string>> => {
    const result: Record<string, Record<string, string>> = {};
    for (const entry of raw.split(',')) {
        const match = /^([^~:]+)~([^~:]+):([A-Za-z0-9_-]+)$/.exec(entry);
        if (!match) continue;
        const id = unescapeToken(match[1] as string);
        const name = unescapeToken(match[2] as string);
        const fragment = fromBase64Url(match[3] as string)?.trim();
        if (id === null || !name || !fragment || !catalog.get(id)) continue;
        result[id] = { ...result[id], [name]: fragment };
    }
    return result;
};

export const decodeState = (query: string, catalog: Catalog): Partial<PortalState> => {
    const params = new Map<string, string>();
    const extra: Record<string, string> = {};
    for (const [rawKey, rawValue] of splitQuery(query)) {
        const key = unescapeToken(rawKey);
        if (key === null || key === '' || params.has(key)) continue;
        if (RESERVED_KEYS.includes(key)) {
            params.set(key, rawValue);
            continue;
        }
        const value = unescapeToken(rawValue);
        if (value !== null && !(key in extra)) extra[key] = value;
    }
    const result: Mutable<Partial<PortalState>> = { tool: unescapeToken(params.get(TOOL_KEY) ?? '') || null, extra };
    const view = params.has(VIEW_KEY) ? decodeView(params.get(VIEW_KEY) as string) : null;
    if (view) result.view = view;
    if (params.has(LAYERS_KEY)) {
        const layers = decodeLayers(params.get(LAYERS_KEY) as string, catalog);
        const fragments = decodeFragments(params.get(FRAGMENTS_KEY) ?? '', catalog);
        const active = Object.fromEntries(Object.entries(fragments).filter(([id]) => layers.active.includes(id)));
        const cql = Object.fromEntries(Object.entries(active).map(([id, named]) => [id, and(...Object.values(named))]));
        result.layers = { ...layers, cql: Object.fromEntries(Object.entries(cql).filter(([, value]) => value !== null)) as Record<string, string> };
        result.fragments = active;
    }
    return result;
};
