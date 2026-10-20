import { describe, expect, it, vi } from 'vitest';
import { createLayerState, createLiveCatalog, defineCatalog, describeState } from '../src/catalog/index.js';
import type { DescriptionSource } from '../src/catalog/index.js';
import { bindMapLibre, resolveUrl } from '../src/maplibre/index.js';
import type { LayerTemplate } from '../src/maplibre/index.js';
import { catalogInput } from './layers.js';
import { createDouble } from './maplibre-double.js';

const salted = (base: DescriptionSource) => {
    let salt = 0;
    const listeners = new Set<() => void>();
    const source: DescriptionSource = {
        getDescriptions: () => base.getDescriptions().map(description => ({ ...description, key: `${description.key}#${salt}` })),
        subscribe: (listener) => {
            listeners.add(listener);
            const stop = base.subscribe(listener);
            return () => {
                listeners.delete(listener);
                stop();
            };
        },
    };
    const bump = (): void => {
        salt += 1;
        for (const listener of [...listeners]) listener();
    };
    return { source, bump };
};

describe('resolveUrl', () => {
    it('resolves relative URLs and keeps the template tokens', () => {
        expect(resolveUrl('/tiles/{z}/{x}/{y}.pbf?k=1', 'https://example.org/app/')).toBe('https://example.org/tiles/{z}/{x}/{y}.pbf?k=1');
        expect(resolveUrl('wms?BBOX={bbox-epsg-3857}', 'https://example.org/geoserver/')).toBe('https://example.org/geoserver/wms?BBOX={bbox-epsg-3857}');
        expect(resolveUrl('https://other.org/{z}.png', 'https://example.org')).toBe('https://other.org/{z}.png');
        expect(resolveUrl('pmtiles://data.pmtiles', 'https://example.org')).toBe('pmtiles://data.pmtiles');
        expect(resolveUrl('/a/{z}', undefined)).toBe('/a/{z}');
    });
});

describe('bindMapLibre baseUrl', () => {
    it('makes relative tiles, TileJSON, PMTiles and GeoJSON URLs absolute', () => {
        const catalog = defineCatalog([
            { id: 'tiles', kind: 'vector-tiles', tiles: { url: '/tiles/a/{z}/{x}/{y}.pbf', sourceLayer: 'a' } },
            { id: 'json', kind: 'vector-tiles', tiles: { url: '/tiles/b.json' } },
            { id: 'pm', kind: 'pmtiles', tiles: { url: 'data/c.pmtiles' } },
            { id: 'xyz', kind: 'xyz', tiles: { url: '/raster/{z}/{x}/{y}.png' } },
            { id: 'geo', kind: 'geojson', data: '/data/d.geojson' },
        ]);
        const double = createDouble();
        const state = createLayerState(catalog, { active: ['tiles', 'json', 'pm', 'xyz', 'geo'] });
        bindMapLibre(double.map, describeState(catalog, state), { baseUrl: 'https://maps.example.org/app/' });
        expect(double.sources.get('urdimbre:tiles')).toMatchObject({ tiles: ['https://maps.example.org/tiles/a/{z}/{x}/{y}.pbf'] });
        expect(double.sources.get('urdimbre:json')).toMatchObject({ url: 'https://maps.example.org/tiles/b.json' });
        expect(double.sources.get('urdimbre:pm')).toMatchObject({ url: 'pmtiles://https://maps.example.org/app/data/c.pmtiles' });
        expect(double.sources.get('urdimbre:xyz')).toMatchObject({ tiles: ['https://maps.example.org/raster/{z}/{x}/{y}.png'] });
        expect(double.sources.get('urdimbre:geo')).toMatchObject({ data: 'https://maps.example.org/data/d.geojson' });
    });
});

describe('bindMapLibre setTiles', () => {
    it('remembers the template it set when the source does not expose tiles', () => {
        const catalog = defineCatalog(catalogInput());
        const double = createDouble({ live: true });
        const state = createLayerState(catalog, { active: ['states'] });
        const { source, bump } = salted(describeState(catalog, state));
        bindMapLibre(double.map, source);
        const live = double.sources.get('urdimbre:states') as { tiles?: string[]; setTiles?: (tiles: string[]) => void };
        const setTiles = vi.fn();
        delete live.tiles;
        live.setTiles = setTiles;
        bump();
        expect(setTiles).not.toHaveBeenCalled();
        state.composer('states').set('table', 'PERSONS > 1');
        expect(setTiles).toHaveBeenCalledTimes(1);
        bump();
        expect(setTiles).toHaveBeenCalledTimes(1);
        expect(double.named('addSource')).toHaveLength(1);
    });
});

describe('bindMapLibre refresh', () => {
    const setup = () => {
        const catalog = createLiveCatalog(defineCatalog(catalogInput()));
        const double = createDouble();
        const state = createLayerState(catalog, { active: ['roads', 'states', 'osm'] });
        const layers = vi.fn((): LayerTemplate[] => [{ type: catalog.get('roads')?.metadata?.style === 'fill' ? 'fill' : 'line' } as LayerTemplate]);
        const binding = bindMapLibre(double.map, describeState(catalog, state), { layers: description => (description.id === 'roads' ? layers() : null) });
        return { catalog, double, state, layers, binding, ids: () => double.layers.map(layer => layer.id) };
    };

    it('rebuilds one layer in place, asking again for its templates', () => {
        const { catalog, double, binding, ids } = setup();
        const order = ids();
        double.calls.length = 0;
        catalog.set({ ...catalog.get('roads'), metadata: { style: 'fill' } });
        expect(double.calls.map(call => call[0])).toEqual([]);
        binding.refresh('roads');
        expect(double.calls.map(call => call[0])).toEqual(['removeLayer', 'removeSource', 'addSource', 'addLayer']);
        expect(double.layers.find(layer => layer.id === 'urdimbre:roads')?.type).toBe('fill');
        expect(ids()).toEqual(order);
    });

    it('ignores inactive layers, refreshes all without an id and still cleans up', () => {
        const { double, binding, ids } = setup();
        const order = ids();
        double.calls.length = 0;
        binding.refresh('parcels');
        expect(double.calls).toEqual([]);
        binding.refresh();
        expect(double.named('addSource').map(call => call[1]).sort()).toEqual(['urdimbre:osm', 'urdimbre:roads', 'urdimbre:states']);
        expect(ids()).toEqual(order);
        binding();
        expect(double.layers.filter(layer => layer.id.startsWith('urdimbre:'))).toEqual([]);
    });
});
