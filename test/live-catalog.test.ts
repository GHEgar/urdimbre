import { describe, expect, it, vi } from 'vitest';
import { CatalogError, createLayerState, createLiveCatalog, defineCatalog, defineLayer, describeState, isLiveCatalog } from '../src/catalog/index.js';
import { legendForState } from '../src/legend/index.js';
import { decodeState, encodeState } from '../src/state/index.js';
import { catalogInput } from './layers.js';

const view = { center: [0, 0] as [number, number], zoom: 2, bearing: 0, pitch: 0 };

const mine = (id = 'mine', extra: Record<string, unknown> = {}) => ({
    id,
    title: 'Mine',
    kind: 'vector-tiles',
    tiles: { url: '/tiles/mine/{z}/{x}/{y}.pbf', sourceLayer: 'layer' },
    ...extra,
});

describe('createLiveCatalog', () => {
    it('starts from a catalog with the same layers and hash', () => {
        const base = defineCatalog(catalogInput());
        const live = createLiveCatalog(base);
        expect(live.layers).toEqual(base.layers);
        expect(live.hash).toBe(base.hash);
        expect(live.get('states')).toBe(base.get('states'));
        expect(isLiveCatalog(live)).toBe(true);
        expect(isLiveCatalog(base)).toBe(false);
        expect(createLiveCatalog(catalogInput()).hash).toBe(base.hash);
        expect(createLiveCatalog().layers).toEqual([]);
    });

    it('adds, replaces and removes layers, changing the hash and notifying', () => {
        const live = createLiveCatalog(defineCatalog(catalogInput()));
        const listener = vi.fn();
        const stop = live.subscribe(listener);
        const first = live.hash;
        const added = live.add(mine());
        expect(Object.isFrozen(added)).toBe(true);
        expect(live.get('mine')).toBe(added);
        expect(live.has('mine')).toBe(true);
        expect(live.layers.at(-1)).toBe(added);
        expect(live.hash).not.toBe(first);
        const second = live.hash;
        expect(live.set(mine())).toBe(added);
        expect(listener).toHaveBeenCalledTimes(1);
        live.set(mine('mine', { title: 'Renamed' }));
        expect(live.get('mine')?.title).toBe('Renamed');
        expect(live.layers.at(-1)?.id).toBe('mine');
        expect(live.hash).not.toBe(second);
        expect(live.remove('mine')).toBe(true);
        expect(live.remove('mine')).toBe(false);
        expect(live.hash).toBe(first);
        expect(listener).toHaveBeenCalledTimes(3);
        stop();
        live.add(mine());
        expect(listener).toHaveBeenCalledTimes(3);
    });

    it('validates like defineCatalog and refuses repeated ids on add', () => {
        const live = createLiveCatalog(defineCatalog(catalogInput()));
        expect(() => live.add(mine('states'))).toThrow(CatalogError);
        expect(() => live.add({ id: 'bad', kind: 'wms' })).toThrow(/layer\.wms is required/);
        expect(() => live.add({ ...mine('odd'), color: 'red' })).toThrow(/layer\.color is not a known field/);
        expect(() => defineLayer({ id: 'x', kind: 'xyz', tiles: { url: 'nope' } }, 'extra')).toThrow(/extra\.tiles\.url/);
        expect(live.get('bad')).toBeUndefined();
    });

    it('feeds layer state, descriptions, the URL and the legend', () => {
        const live = createLiveCatalog(defineCatalog(catalogInput()));
        const state = createLayerState(live, { active: ['states'] });
        const source = describeState(live, state);
        const listener = vi.fn();
        source.subscribe(listener);
        expect(() => state.add('mine')).toThrow(RangeError);
        live.add(mine('mine', { opacity: 0.5, geometryType: 'polygon' }));
        expect(listener).toHaveBeenCalled();
        state.add('mine');
        expect(state.getSnapshot().opacity.mine).toBe(0.5);
        expect(source.getDescriptions().map(item => item.id)).toEqual(['mine', 'states']);
        const query = encodeState({ view, layers: state.getSnapshot(), tool: null }, live);
        expect(query).toContain('mine:50');
        expect(decodeState(query, live).layers?.active).toEqual(['mine', 'states']);
        expect(legendForState(live, source.getDescriptions()).map(entry => `${entry.layerId}:${entry.kind}`)).toEqual(['mine:symbols', 'states:image']);
        const before = source.getDescriptions();
        live.remove('mine');
        expect(source.getDescriptions()).not.toBe(before);
        expect(source.getDescriptions().map(item => item.id)).toEqual(['states']);
        expect(decodeState(query, live).layers?.active).toEqual(['states']);
        live.add(mine());
        expect(source.getDescriptions().map(item => item.id)).toEqual(['mine', 'states']);
    });
});
