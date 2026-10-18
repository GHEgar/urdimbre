import { describe as group, expect, it } from 'vitest';
import { createLayerState, defineCatalog, describe, describeState } from '../src/catalog/index.js';
import type { WmsImageSource, WmsTilesSource } from '../src/catalog/index.js';
import { catalogInput, GS } from './layers.js';
import { query } from './helpers.js';

const catalog = defineCatalog(catalogInput());

group('describe', () => {
    it('is deterministic', () => {
        const state = createLayerState(catalog, { active: ['states', 'storms', 'osm'] });
        state.composer('states').set('table', 'PERSONS > 1');
        const first = describe(catalog, state.getSnapshot());
        const again = describe(defineCatalog(catalogInput()), createLayerState(catalog, { ...state.getSnapshot() }).getSnapshot());
        expect(again).toEqual(first);
        expect(JSON.stringify(again)).toBe(JSON.stringify(first));
    });

    it('describes WMS as fixed tiles with canonical parameters by default', () => {
        const [states] = describe(catalog, createLayerState(catalog, { active: ['states'] }).getSnapshot());
        const source = states?.source as WmsTilesSource;
        expect(source.type).toBe('wms-tiles');
        expect(source.tileSize).toBe(256);
        expect(source.url).toBe(GS);
        expect(Object.keys(source.params)).toEqual(['FORMAT', 'LAYERS', 'STYLES', 'TILED', 'TRANSPARENT', 'VERSION']);
        expect(source.params).toMatchObject({ TILED: 'true', TRANSPARENT: 'true', VERSION: '1.3.0', FORMAT: 'image/png' });
        expect(query(states?.key as string)).toMatchObject({ REQUEST: 'GetMap', SERVICE: 'WMS', WIDTH: '256', HEIGHT: '256', LAYERS: 'topp:states' });
    });

    it('describes a single image only when the layer asks for it', () => {
        const [elevation] = describe(catalog, createLayerState(catalog, { active: ['elevation'] }).getSnapshot());
        const source = elevation?.source as WmsImageSource;
        expect(source.type).toBe('wms-image');
        expect(source.params.TILED).toBeUndefined();
        expect(query(elevation?.key as string).WIDTH).toBeUndefined();
    });

    it('sends TIME and other dimensions apart from the CQL', () => {
        const state = createLayerState(catalog, { active: ['storms', 'elevation'] });
        state.composer('storms').set('table', 'speed > 10');
        let [storms] = describe(catalog, state.getSnapshot());
        let params = (storms?.source as WmsTilesSource).params;
        expect(params.TIME).toBe('1990-07-22T06:00:00.000Z');
        expect(params.CQL_FILTER).toBe('speed > 10');
        expect(params.CQL_FILTER).not.toMatch(/1990/);
        state.setDimension('storms', 'time', '1990-07-23T00:00:00.000Z');
        state.setDimension('elevation', 'elevation', '200');
        state.setDimension('elevation', 'level', '2');
        [storms] = describe(catalog, state.getSnapshot());
        params = (storms?.source as WmsTilesSource).params;
        expect(params.TIME).toBe('1990-07-23T00:00:00.000Z');
        const elevation = (describe(catalog, state.getSnapshot())[1]?.source as WmsImageSource).params;
        expect(elevation).toMatchObject({ ELEVATION: '200', DIM_LEVEL: '2' });
    });

    it('orders zIndex by position with the first layer on top', () => {
        const state = createLayerState(catalog, { active: ['states', 'osm', 'roads'] });
        expect(describe(catalog, state.getSnapshot()).map(layer => [layer.id, layer.zIndex])).toEqual([['states', 130], ['osm', 120], ['roads', 110]]);
        state.move('roads', 0);
        expect(describe(catalog, state.getSnapshot()).map(layer => layer.zIndex)).toEqual([130, 120, 110]);
        expect(describe(catalog, state.getSnapshot())[0]?.id).toBe('roads');
    });

    it('changes the key with the CQL and keeps it with opacity', () => {
        const state = createLayerState(catalog, { active: ['states'] });
        const key = describe(catalog, state.getSnapshot())[0]?.key;
        state.setOpacity('states', 0.4);
        state.setVisible('states', false);
        const faded = describe(catalog, state.getSnapshot())[0];
        expect(faded).toMatchObject({ key, opacity: 0.4, visible: false });
        state.composer('states').set('table', 'PERSONS > 1');
        expect(describe(catalog, state.getSnapshot())[0]?.key).not.toBe(key);
    });

    it('describes tiles, PMTiles and GeoJSON', () => {
        const state = createLayerState(catalog, { active: ['osm', 'roads', 'parcels', 'points', 'wfs-states'] });
        state.composer('wfs-states').set('table', 'PERSONS > 1');
        const [osm, roads, parcels, points, wfs] = describe(catalog, state.getSnapshot());
        expect(osm).toMatchObject({ kind: 'xyz', maxZoom: 19, source: { type: 'xyz', attribution: '© OpenStreetMap' } });
        expect(roads?.source).toEqual({ type: 'vector-tiles', url: 'https://tiles.example.org/roads/{z}/{x}/{y}.pbf', sourceLayer: 'roads' });
        expect(parcels?.source.type).toBe('pmtiles');
        expect(points?.key).toMatch(/^data:[0-9a-f]{8}$/);
        expect(query(wfs?.key as string)).toMatchObject({ REQUEST: 'GetFeature', TYPENAMES: 'topp:states', CQL_FILTER: 'PERSONS > 1', SRSNAME: 'EPSG:4326' });
    });

    it('caches descriptions per snapshot', () => {
        const state = createLayerState(catalog, { active: ['osm'] });
        const source = describeState(catalog, state);
        const first = source.getDescriptions();
        expect(source.getDescriptions()).toBe(first);
        state.setOpacity('osm', 0.5);
        expect(source.getDescriptions()).not.toBe(first);
    });
});
