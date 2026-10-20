import { fnv1a, stableJson } from '../shared/hash.js';
import type { Catalog, LayerDef } from './types.js';
import { CatalogError, isRecord, validateLayer } from './validate.js';

const deepFreeze = <T>(value: T): T => {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const item of Object.values(value)) deepFreeze(item);
    }
    return value;
};

export const defineLayer = (input: unknown, path = 'layer'): LayerDef => deepFreeze(validateLayer(input, path));

export const catalogHash = (layers: readonly LayerDef[]): string => fnv1a(stableJson(layers));

const readLayers = (input: unknown): unknown[] => {
    if (Array.isArray(input)) return input;
    if (isRecord(input) && 'layers' in input) {
        if (Array.isArray(input.layers)) return input.layers;
        throw new CatalogError('layers', 'must be an array');
    }
    throw new CatalogError('catalog', 'must be an array of layers or an object with layers');
};

export const defineCatalog = (input: unknown): Catalog => {
    const layers = readLayers(input).map((entry, index) => validateLayer(entry, `layers[${index}]`));
    const byId = new Map<string, LayerDef>();
    layers.forEach((layer, index) => {
        if (byId.has(layer.id)) throw new CatalogError(`layers[${index}].id`, `repeats the id ${layer.id}`);
        byId.set(layer.id, layer);
    });
    deepFreeze(layers);
    const hash = catalogHash(layers);
    return Object.freeze({ layers, hash, get: (id: string) => byId.get(id) });
};
