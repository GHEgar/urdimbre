import type { Map as MaplibreMap } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';
import { createArbiter } from '../src/arbiter/index.js';
import { createLayerState, defineCatalog, describeState } from '../src/catalog/index.js';
import { bindArbiter, bindMapLibre } from '../src/maplibre/index.js';
import type { MapLibreMapLike } from '../src/maplibre/index.js';
import { query } from './helpers.js';
import { catalogInput } from './layers.js';
import { createDouble } from './maplibre-double.js';

const catalog = defineCatalog(catalogInput());

export const fitsRealMap = (map: MaplibreMap): MapLibreMapLike => map;

const setup = (active: string[], options: Parameters<typeof createDouble>[0] = {}) => {
    const double = createDouble(options);
    const state = createLayerState(catalog, { active });
    const stop = bindMapLibre(double.map, describeState(catalog, state));
    return { ...double, state, stop, ids: () => double.layers.map(layer => layer.id) };
};

describe('bindMapLibre', () => {
    it('creates one source and layer per logical layer, in order', () => {
        const { sources, layers, ids } = setup(['states', 'osm', 'roads', 'parcels', 'points']);
        expect(ids()).toEqual(['urdimbre:points', 'urdimbre:parcels', 'urdimbre:roads', 'urdimbre:osm', 'urdimbre:states']);
        const states = sources.get('urdimbre:states') as { type: string; tiles: string[]; tileSize: number };
        expect(states.type).toBe('raster');
        expect(states.tileSize).toBe(256);
        const template = states.tiles[0] as string;
        expect(template.endsWith('&BBOX={bbox-epsg-3857}')).toBe(true);
        expect(query(template.replace('{bbox-epsg-3857}', '0,0,1,1'))).toMatchObject({ CRS: 'EPSG:3857', WIDTH: '256', HEIGHT: '256', TILED: 'true', LAYERS: 'topp:states' });
        expect(sources.get('urdimbre:parcels')).toMatchObject({ type: 'vector', url: 'pmtiles://https://data.example.org/parcels.pmtiles' });
        expect(sources.get('urdimbre:roads')).toMatchObject({ type: 'vector', tiles: ['https://tiles.example.org/roads/{z}/{x}/{y}.pbf'] });
        expect(sources.get('urdimbre:osm')).toMatchObject({ attribution: '© OpenStreetMap' });
        expect(layers.find(layer => layer.id === 'urdimbre:roads')).toMatchObject({ 'type': 'line', 'source-layer': 'roads' });
        expect(layers.find(layer => layer.id === 'urdimbre:osm')).toMatchObject({ type: 'raster', maxzoom: 19, paint: { 'raster-opacity': 1 } });
    });

    it('changes only opacity and visibility without touching the source', () => {
        const { state, calls, named } = setup(['states']);
        calls.length = 0;
        state.setOpacity('states', 0.4);
        state.setVisible('states', false);
        expect(calls).toEqual([
            ['setPaintProperty', 'urdimbre:states', 'raster-opacity', 0.4],
            ['setLayoutProperty', 'urdimbre:states', 'visibility', 'none'],
        ]);
        expect(named('addSource')).toHaveLength(0);
    });

    it('replaces the source when the CQL changes the key', () => {
        const { state, calls, sources, ids } = setup(['states', 'osm']);
        calls.length = 0;
        state.composer('states').set('table', 'PERSONS > 1');
        expect(calls.map(call => call[0])).toEqual(['removeLayer', 'removeSource', 'addSource', 'addLayer', 'moveLayer', 'moveLayer']);
        const tiles = (sources.get('urdimbre:states') as { tiles: string[] }).tiles[0] as string;
        expect(query(tiles.replace('{bbox-epsg-3857}', '0')).CQL_FILTER).toBe('PERSONS > 1');
        expect(ids()).toEqual(['urdimbre:osm', 'urdimbre:states']);
    });

    it('uses setTiles and setData when the source has them', () => {
        const { state, calls, named } = setup(['states', 'wfs-states'], { live: true });
        calls.length = 0;
        state.composer('states').set('table', 'PERSONS > 1');
        state.composer('wfs-states').set('table', 'PERSONS > 1');
        expect(calls.map(call => call[0])).toEqual(['setTiles', 'setData']);
        expect(named('setData')[0]?.[2]).toMatch(/CQL_FILTER=PERSONS/);
    });

    it('moves layers when the order changes and removes the ones that leave', () => {
        const { state, ids, named, sources } = setup(['states', 'osm', 'roads']);
        state.move('roads', 0);
        expect(ids()).toEqual(['urdimbre:osm', 'urdimbre:states', 'urdimbre:roads']);
        const moves = named('moveLayer').length;
        state.setOpacity('roads', 0.5);
        expect(named('moveLayer')).toHaveLength(moves);
        state.remove('states');
        expect(ids()).toEqual(['urdimbre:osm', 'urdimbre:roads']);
        expect(sources.has('urdimbre:states')).toBe(false);
    });

    it('keeps its layers below beforeId and leaves foreign layers alone', () => {
        const double = createDouble();
        double.map.addLayer({ id: 'labels', type: 'background' });
        const state = createLayerState(catalog, { active: ['states', 'osm'] });
        const stop = bindMapLibre(double.map, describeState(catalog, state), { beforeId: 'labels', layers: () => [{ type: 'fill', paint: { 'fill-opacity': 0.5 } }] });
        expect(double.layers.map(layer => layer.id)).toEqual(['urdimbre:osm', 'urdimbre:states', 'labels']);
        expect(double.layers[0]).toMatchObject({ type: 'fill', paint: { 'fill-opacity': 0.5 } });
        state.setOpacity('osm', 0.5);
        expect(double.named('setPaintProperty').at(-1)).toEqual(['setPaintProperty', 'urdimbre:osm', 'fill-opacity', 0.25]);
        stop();
        expect(double.layers.map(layer => layer.id)).toEqual(['labels']);
        expect(double.sources.size).toBe(0);
    });

    it('waits for the style and adds again after a style change', () => {
        const double = createDouble({ loaded: false });
        const state = createLayerState(catalog, { active: ['osm'] });
        bindMapLibre(double.map, describeState(catalog, state));
        expect(double.calls).toHaveLength(0);
        state.add('states');
        double.setLoaded(true);
        double.fire('style.load');
        expect(double.layers.map(layer => layer.id)).toEqual(['urdimbre:osm', 'urdimbre:states']);
        double.resetStyle();
        double.fire('styledata');
        expect(double.layers.map(layer => layer.id)).toEqual(['urdimbre:osm', 'urdimbre:states']);
        expect(double.named('addSource')).toHaveLength(4);
    });
});

describe('bindArbiter for MapLibre', () => {
    it('turns click into a pointer', () => {
        const double = createDouble();
        const arbiter = createArbiter();
        const click = vi.fn();
        arbiter.claim('measure', { click });
        const stop = bindArbiter(double.map, arbiter);
        const originalEvent = new MouseEvent('click');
        double.fire('click', { lngLat: { lng: -103.35, lat: 20.67 }, point: { x: 5, y: 6 }, originalEvent });
        expect(click).toHaveBeenCalledWith({ coordinate: [-103.35, 20.67], pixel: [5, 6], originalEvent });
        stop();
        double.fire('click', { lngLat: { lng: 0, lat: 0 }, point: { x: 0, y: 0 }, originalEvent });
        expect(click).toHaveBeenCalledOnce();
    });
});
