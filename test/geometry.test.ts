import { describe, expect, it } from 'vitest';
import { createLayerState, defineCatalog, describe as describeLayers, describeState } from '../src/catalog/index.js';
import { DEFAULT_SYMBOL_COLOR, legendForState, shapesOf } from '../src/legend/index.js';
import { bindMapLibre } from '../src/maplibre/index.js';
import { createDouble } from './maplibre-double.js';

const catalog = defineCatalog([
    { id: 'stops', title: 'Stops', kind: 'vector-tiles', tiles: { url: 'https://t.example.org/s/{z}/{x}/{y}.pbf', sourceLayer: 's' }, geometryType: 'point' },
    { id: 'blocks', title: 'Blocks', kind: 'pmtiles', tiles: { url: 'https://t.example.org/b.pmtiles' }, geometryType: 'polygon' },
    { id: 'rivers', title: 'Rivers', kind: 'geojson', data: 'https://t.example.org/r.geojson', geometryType: 'line' },
    { id: 'mixed', title: 'Mixed', kind: 'geojson', data: { type: 'FeatureCollection', features: [
        { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [] }, properties: null },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: null },
    ] } },
    { id: 'plain', title: 'Plain', kind: 'vector-tiles', tiles: { url: 'https://t.example.org/p.json' } },
]);

const all = ['stops', 'blocks', 'rivers', 'mixed', 'plain'];

describe('geometryType', () => {
    it('is validated and only fits vector kinds', () => {
        expect(catalog.get('stops')?.geometryType).toBe('point');
        expect(() => defineCatalog([{ id: 'a', kind: 'geojson', data: 'x.geojson', geometryType: 'area' }])).toThrow(/layers\[0\]\.geometryType must be one of point, line, polygon/);
        expect(() => defineCatalog([{ id: 'a', kind: 'xyz', tiles: { url: 'https://x/{z}/{x}/{y}' }, geometryType: 'point' }])).toThrow(/does not fit kind xyz/);
        expect(() => defineCatalog([{ id: 'a', kind: 'wms', wms: { url: 'https://x/wms', layers: 'a' }, geometryType: 'line' }])).toThrow(/does not fit kind wms/);
    });

    it('reaches the description without changing its key', () => {
        const [stops] = describeLayers(catalog, { active: ['stops'], opacity: {}, visible: {}, dimensions: {}, cql: {} });
        expect(stops?.geometryType).toBe('point');
        expect(stops?.key).toBe('vector-tiles:https://t.example.org/s/{z}/{x}/{y}.pbf');
    });

    it('gives the shapes from the declared type or the inline GeoJSON', () => {
        expect(all.map(id => shapesOf(catalog.get(id) as never))).toEqual([['point'], ['fill'], ['line'], ['point', 'fill'], []]);
    });

    it('builds symbol legends for vector layers', () => {
        const state = createLayerState(catalog, { active: all });
        const descriptions = describeState(catalog, state).getDescriptions();
        const entries = legendForState(catalog, descriptions);
        expect(entries.map(entry => entry.layerId)).toEqual(['stops', 'blocks', 'rivers', 'mixed']);
        expect(entries[0]).toEqual({ kind: 'symbols', layerId: 'stops', title: 'Stops', items: [{ label: 'Stops', color: DEFAULT_SYMBOL_COLOR, shape: 'point' }] });
        expect(entries[3]).toMatchObject({ items: [{ label: 'Points', shape: 'point' }, { label: 'Areas', shape: 'fill' }] });
        const styled = legendForState(catalog, descriptions, {
            symbolColor: (_description, def) => (def.id === 'blocks' ? '#123456' : null),
            shapeLabels: { point: 'Puntos' },
        });
        expect(styled[1]).toMatchObject({ items: [{ color: '#123456', shape: 'fill' }] });
        expect(styled[3]).toMatchObject({ items: [{ label: 'Puntos', color: DEFAULT_SYMBOL_COLOR }, { label: 'Areas' }] });
        expect(legendForState(catalog, descriptions, { symbolColor: 'red' })[2]).toMatchObject({ items: [{ color: 'red', shape: 'line' }] });
    });

    it('picks the default MapLibre style layer from the geometry', () => {
        const double = createDouble();
        const state = createLayerState(catalog, { active: all });
        bindMapLibre(double.map, describeState(catalog, state));
        expect(Object.fromEntries(double.layers.map(layer => [layer.id, layer.type]))).toEqual({
            'urdimbre:plain': 'line',
            'urdimbre:mixed': 'line',
            'urdimbre:rivers': 'line',
            'urdimbre:blocks': 'fill',
            'urdimbre:stops': 'circle',
        });
    });
});
