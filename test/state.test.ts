import { describe, expect, it, vi } from 'vitest';
import { createLayerState, defineCatalog } from '../src/catalog/index.js';
import { inList } from '../src/cql/index.js';
import { catalogInput } from './layers.js';

const catalog = defineCatalog(catalogInput());

describe('layer state', () => {
    it('adds on top, at a position, and ignores a repeated add', () => {
        const state = createLayerState(catalog);
        state.add('osm');
        state.add('states');
        state.add('roads', 1);
        expect(state.getSnapshot().active).toEqual(['states', 'roads', 'osm']);
        const before = state.getSnapshot();
        state.add('states');
        expect(state.getSnapshot()).toBe(before);
    });

    it('moves and removes layers', () => {
        const state = createLayerState(catalog, { active: ['states', 'roads', 'osm'] });
        state.move('osm', 0);
        expect(state.getSnapshot().active).toEqual(['osm', 'states', 'roads']);
        state.move('osm', 10);
        expect(state.getSnapshot().active).toEqual(['states', 'roads', 'osm']);
        state.add('osm', 1);
        expect(state.getSnapshot().active).toEqual(['states', 'osm', 'roads']);
        state.remove('states');
        expect(state.getSnapshot().active).toEqual(['osm', 'roads']);
    });

    it('rejects unknown layers and invalid opacity', () => {
        const state = createLayerState(catalog);
        expect(() => state.add('nope')).toThrow(/Unknown layer: nope/);
        expect(() => createLayerState(catalog, { active: ['nope'] })).toThrow(RangeError);
        expect(() => state.setOpacity('osm', Number.NaN)).toThrow(RangeError);
    });

    it('keeps opacity, visibility and dimensions sparse and clamped', () => {
        const state = createLayerState(catalog, { active: ['storms'] });
        state.setOpacity('storms', 1.4);
        expect(state.getSnapshot().opacity).toEqual({});
        state.setOpacity('storms', 0.5);
        state.setVisible('storms', false);
        state.setDimension('storms', 'TIME', '1990-07-22T12:00:00.000Z');
        expect(state.getSnapshot()).toMatchObject({ opacity: { storms: 0.5 }, visible: { storms: false }, dimensions: { storms: { time: '1990-07-22T12:00:00.000Z' } } });
        state.setDimension('storms', 'time', null);
        state.setVisible('storms', true);
        expect(state.getSnapshot()).toMatchObject({ visible: {}, dimensions: {} });
    });

    it('notifies once per real change and keeps the snapshot otherwise', () => {
        const state = createLayerState(catalog);
        const listener = vi.fn();
        const stop = state.subscribe(listener);
        state.add('osm');
        state.setOpacity('osm', 0.3);
        state.setOpacity('osm', 0.3);
        state.remove('roads');
        expect(listener).toHaveBeenCalledTimes(2);
        stop();
        state.remove('osm');
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('selects only what changes', () => {
        const state = createLayerState(catalog, { active: ['states', 'osm'] });
        const opacity = vi.fn();
        const order = vi.fn();
        state.select(s => s.opacity.states ?? 1, opacity);
        state.select(s => s.active, order);
        state.setOpacity('osm', 0.2);
        state.setVisible('states', false);
        expect(opacity).not.toHaveBeenCalled();
        state.setOpacity('states', 0.4);
        expect(opacity).toHaveBeenCalledWith(0.4);
        state.move('osm', 0);
        expect(order).toHaveBeenCalledOnce();
        const joined = vi.fn();
        state.select(s => [...s.active], joined, (a, b) => a.join() === b.join());
        state.setOpacity('states', 0.9);
        expect(joined).not.toHaveBeenCalled();
    });

    it('keeps one CQL composer per layer', () => {
        const state = createLayerState(catalog, {}, { cqlOrder: ['table', 'legend'] });
        const composer = state.composer('states');
        expect(state.composer('states')).toBe(composer);
        composer.set('legend', inList('SUB_REGION', ['Pacific']));
        composer.set('table', 'PERSONS > 1000000');
        expect(state.getSnapshot().cql).toEqual({ states: '(PERSONS > 1000000) AND (SUB_REGION = \'Pacific\')' });
        state.composer('storms').set('table', 'x = 1');
        expect(Object.keys(state.getSnapshot().cql)).toEqual(['states', 'storms']);
        composer.set('legend', null);
        composer.set('table', null);
        expect(state.getSnapshot().cql).toEqual({ storms: 'x = 1' });
        expect(() => state.composer('nope')).toThrow(RangeError);
    });

    it('reads an initial snapshot', () => {
        const state = createLayerState(catalog, {
            active: ['states', 'states', 'osm'],
            opacity: { osm: 0.7 },
            visible: { states: false },
            dimensions: { storms: { time: '1990' } },
            cql: { states: 'PERSONS > 5' },
        });
        expect(state.getSnapshot()).toEqual({
            active: ['states', 'osm'],
            opacity: { osm: 0.7 },
            visible: { states: false },
            dimensions: { storms: { time: '1990' } },
            cql: { states: 'PERSONS > 5' },
        });
        expect(state.composer('states').get('base')).toBe('PERSONS > 5');
    });
});
