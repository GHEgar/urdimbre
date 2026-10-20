import { createCqlComposer } from '../cql/composer.js';
import type { CqlComposer } from '../cql/composer.js';
import { isLiveCatalog } from './live.js';
import type { Catalog } from './types.js';

export interface LayerStateSnapshot {
    active: readonly string[];
    opacity: Readonly<Record<string, number>>;
    visible: Readonly<Record<string, boolean>>;
    dimensions: Readonly<Record<string, Readonly<Record<string, string>>>>;
    cql: Readonly<Record<string, string | null>>;
}

export interface LayerState {
    add(id: string, at?: number): void;
    remove(id: string): void;
    move(id: string, to: number): void;
    setOpacity(id: string, value: number): void;
    setVisible(id: string, value: boolean): void;
    setDimension(id: string, name: string, value: string | null): void;
    composer(id: string): CqlComposer;
    subscribe(listener: () => void): () => void;
    getSnapshot(): LayerStateSnapshot;
    select<T>(selector: (s: LayerStateSnapshot) => T, listener: (value: T) => void, equal?: (a: T, b: T) => boolean): () => void;
}

export interface LayerStateOptions {
    cqlOrder?: readonly string[];
}

export const INITIAL_CQL_FRAGMENT = 'base';

const catalogs = new WeakMap<LayerState, Catalog>();

const declaredOpacities = (catalog: Catalog): Record<string, number> =>
    Object.fromEntries(catalog.layers.flatMap(layer => (layer.opacity === undefined ? [] : [[layer.id, layer.opacity]])));

export const defaultOpacities = (state: LayerState): Readonly<Record<string, number>> => {
    const catalog = catalogs.get(state);
    return catalog ? declaredOpacities(catalog) : {};
};

export const defaultOpacity = (state: LayerState, id: string): number => defaultOpacities(state)[id] ?? 1;

const without = <T>(record: Readonly<Record<string, T>>, key: string): Readonly<Record<string, T>> => {
    if (!(key in record)) return record;
    return Object.freeze(Object.fromEntries(Object.entries(record).filter(([name]) => name !== key)));
};

const clampIndex = (index: number, length: number): number => Math.max(0, Math.min(length, Math.trunc(index)));

export const createLayerState = (catalog: Catalog, initial: Partial<LayerStateSnapshot> = {}, options: LayerStateOptions = {}): LayerState => {
    const listeners = new Set<() => void>();
    const composers = new Map<string, CqlComposer>();

    const known = (id: string): string => {
        if (!catalog.get(id)) throw new RangeError(`Unknown layer: ${id}`);
        return id;
    };

    let snapshot: LayerStateSnapshot = Object.freeze({
        active: Object.freeze([...new Set((initial.active ?? []).map(known))]),
        opacity: Object.freeze({}),
        visible: Object.freeze({}),
        dimensions: Object.freeze({}),
        cql: Object.freeze({}),
    });

    const commit = (patch: Partial<LayerStateSnapshot>): void => {
        snapshot = Object.freeze({ ...snapshot, ...patch });
        for (const listener of [...listeners]) listener();
    };

    const setActive = (active: string[]): void => {
        if (active.length === snapshot.active.length && active.every((id, index) => id === snapshot.active[index])) return;
        commit({ active: Object.freeze(active) });
    };

    const composer = (id: string): CqlComposer => {
        known(id);
        const existing = composers.get(id);
        if (existing) return existing;
        const created = createCqlComposer(options.cqlOrder ? { order: options.cqlOrder } : {});
        composers.set(id, created);
        created.subscribe(() => {
            const cql = created.compose();
            commit({ cql: cql === null ? without(snapshot.cql, id) : Object.freeze({ ...snapshot.cql, [id]: cql }) });
        });
        return created;
    };

    const state: LayerState = {
        add(id, at) {
            known(id);
            const rest = snapshot.active.filter(item => item !== id);
            if (at === undefined && rest.length !== snapshot.active.length) return;
            rest.splice(clampIndex(at ?? 0, rest.length), 0, id);
            setActive(rest);
        },
        remove(id) {
            setActive(snapshot.active.filter(item => item !== id));
        },
        move(id, to) {
            if (!snapshot.active.includes(id)) return;
            const rest = snapshot.active.filter(item => item !== id);
            rest.splice(clampIndex(to, rest.length), 0, id);
            setActive(rest);
        },
        setOpacity(id, value) {
            known(id);
            if (!Number.isFinite(value)) throw new RangeError(`Opacity must be a finite number: ${value}`);
            const next = Math.max(0, Math.min(1, value));
            if ((snapshot.opacity[id] ?? 1) === next) return;
            commit({ opacity: next === 1 ? without(snapshot.opacity, id) : Object.freeze({ ...snapshot.opacity, [id]: next }) });
        },
        setVisible(id, value) {
            known(id);
            if ((snapshot.visible[id] ?? true) === value) return;
            commit({ visible: value ? without(snapshot.visible, id) : Object.freeze({ ...snapshot.visible, [id]: false }) });
        },
        setDimension(id, name, value) {
            known(id);
            const key = name.trim().toLowerCase();
            const current = snapshot.dimensions[id] ?? {};
            const next = value?.trim() || null;
            if ((current[key] ?? null) === next) return;
            const layer = next === null ? without(current, key) : Object.freeze({ ...current, [key]: next });
            const dimensions = Object.keys(layer).length === 0 ? without(snapshot.dimensions, id) : Object.freeze({ ...snapshot.dimensions, [id]: layer });
            commit({ dimensions });
        },
        composer,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getSnapshot: () => snapshot,
        select(selector, listener, equal = Object.is) {
            let current = selector(snapshot);
            return state.subscribe(() => {
                const next = selector(snapshot);
                if (equal(current, next)) return;
                current = next;
                listener(next);
            });
        },
    };

    const declared = declaredOpacities(catalog);
    catalogs.set(state, catalog);
    for (const [id, value] of Object.entries(declared)) {
        if (initial.opacity?.[id] === undefined) state.setOpacity(id, value);
    }
    for (const [id, value] of Object.entries(initial.opacity ?? {})) state.setOpacity(id, value);
    for (const [id, value] of Object.entries(initial.visible ?? {})) state.setVisible(id, value);
    for (const [id, values] of Object.entries(initial.dimensions ?? {})) {
        for (const [name, value] of Object.entries(values)) state.setDimension(id, name, value);
    }
    for (const [id, cql] of Object.entries(initial.cql ?? {})) composer(id).set(INITIAL_CQL_FRAGMENT, cql);
    if (isLiveCatalog(catalog)) {
        const seen = new Set(catalog.layers.map(layer => layer.id));
        catalog.subscribe(() => {
            for (const layer of catalog.layers) {
                if (seen.has(layer.id)) continue;
                seen.add(layer.id);
                if (layer.opacity !== undefined && snapshot.opacity[layer.id] === undefined) state.setOpacity(layer.id, layer.opacity);
            }
        });
    }
    return state;
};
