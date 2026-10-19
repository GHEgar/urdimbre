import { describe, expect, it } from 'vitest';
import { CatalogError, createLayerState, defineCatalog, describe as describeLayers } from '../src/catalog/index.js';
import { applyLayerState, decodeState, encodeState, readLayerState } from '../src/state/index.js';
import { catalogInput } from './layers.js';

const withDefaults = () => {
    const input = catalogInput();
    const [states, , , osm] = input.layers as Record<string, unknown>[];
    Object.assign(states as object, { opacity: 0.6, metadata: { thumbnail: 'states.png', skin: { color: '#c05030' } } });
    Object.assign(osm as object, { opacity: 0 });
    return input;
};

describe('LayerDef metadata and opacity', () => {
    it('keeps metadata untouched, frozen and inside the hash', () => {
        const catalog = defineCatalog(withDefaults());
        const metadata = catalog.get('states')?.metadata;
        expect(metadata).toEqual({ thumbnail: 'states.png', skin: { color: '#c05030' } });
        expect(Object.isFrozen(metadata?.skin)).toBe(true);
        const changed = withDefaults();
        (changed.layers[0] as unknown as { metadata: { skin: { color: string } } }).metadata.skin.color = '#000000';
        expect(defineCatalog(changed).hash).not.toBe(catalog.hash);
        expect(defineCatalog(catalogInput()).hash).not.toBe(catalog.hash);
    });

    it('rejects metadata that is not an object and opacity out of range', () => {
        const fails = (patch: Record<string, unknown>): string => {
            const input = catalogInput();
            Object.assign(input.layers[0] as object, patch);
            try {
                defineCatalog(input);
            } catch (error) {
                if (error instanceof CatalogError) return error.path;
            }
            return '';
        };
        expect(fails({ metadata: ['a'] })).toBe('layers[0].metadata');
        expect(fails({ metadata: 'a' })).toBe('layers[0].metadata');
        expect(fails({ opacity: 1.5 })).toBe('layers[0].opacity');
        expect(fails({ opacity: '0.5' })).toBe('layers[0].opacity');
    });

    it('starts each layer with its declared opacity unless the initial state says otherwise', () => {
        const catalog = defineCatalog(withDefaults());
        const plain = createLayerState(catalog, { active: ['states', 'osm', 'roads'] });
        expect(plain.getSnapshot().opacity).toEqual({ states: 0.6, osm: 0 });
        expect(describeLayers(catalog, plain.getSnapshot()).map(item => item.opacity)).toEqual([0.6, 0, 1]);
        const given = createLayerState(catalog, { active: ['states'], opacity: { states: 0.9 } });
        expect(given.getSnapshot().opacity).toEqual({ states: 0.9, osm: 0 });
    });

    it('goes back to the declared opacity for layers a URL leaves out', () => {
        const catalog = defineCatalog(withDefaults());
        const layers = createLayerState(catalog, { active: ['states', 'osm'] });
        layers.setOpacity('osm', 0.3);
        applyLayerState(layers, decodeState('l=roads', catalog));
        expect(layers.getSnapshot().opacity).toEqual({ states: 0.6, osm: 0 });
        applyLayerState(layers, decodeState('l=states,roads:50', catalog));
        expect(layers.getSnapshot().opacity).toEqual({ osm: 0, roads: 0.5 });
        expect(describeLayers(catalog, layers.getSnapshot()).map(item => item.opacity)).toEqual([1, 0.5]);
        const query = encodeState({ view: { center: [0, 0], zoom: 2, bearing: 0, pitch: 0 }, ...readLayerState(layers) }, catalog);
        expect(query).toContain('l=states,roads:50');
    });
});
