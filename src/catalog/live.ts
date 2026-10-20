import { catalogHash, defineCatalog, defineLayer } from './define.js';
import type { Catalog, LayerDef } from './types.js';
import { CatalogError } from './validate.js';

export interface LiveCatalog extends Catalog {
    add(def: unknown): LayerDef;
    set(def: unknown): LayerDef;
    remove(id: string): boolean;
    has(id: string): boolean;
    subscribe(listener: () => void): () => void;
}

const isCatalog = (value: unknown): value is Catalog => {
    const candidate = value as Partial<Catalog> | null;
    return typeof candidate === 'object' && candidate !== null && Array.isArray(candidate.layers)
        && typeof candidate.hash === 'string' && typeof candidate.get === 'function';
};

export const isLiveCatalog = (catalog: Catalog): catalog is LiveCatalog =>
    typeof (catalog as Partial<LiveCatalog>).subscribe === 'function';

export const createLiveCatalog = (base: Catalog | unknown = []): LiveCatalog => {
    const start = isCatalog(base) ? base.layers : defineCatalog(base).layers;
    const byId = new Map<string, LayerDef>(start.map(layer => [layer.id, layer]));
    const listeners = new Set<() => void>();
    let layers: readonly LayerDef[] = Object.freeze([...byId.values()]);
    let hash = isCatalog(base) ? base.hash : catalogHash(layers);

    const commit = (): void => {
        layers = Object.freeze([...byId.values()]);
        hash = catalogHash(layers);
        for (const listener of [...listeners]) listener();
    };

    const put = (def: unknown, replace: boolean): LayerDef => {
        const layer = defineLayer(def);
        const current = byId.get(layer.id);
        if (current && !replace) throw new CatalogError('layer.id', `repeats the id ${layer.id}`);
        if (current && catalogHash([current]) === catalogHash([layer])) return current;
        byId.set(layer.id, layer);
        commit();
        return layer;
    };

    return {
        get layers() {
            return layers;
        },
        get hash() {
            return hash;
        },
        get: id => byId.get(id),
        has: id => byId.has(id),
        add: def => put(def, false),
        set: def => put(def, true),
        remove(id) {
            if (!byId.delete(id)) return false;
            commit();
            return true;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
};
