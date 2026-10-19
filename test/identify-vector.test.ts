import { describe, expect, it, vi } from 'vitest';
import { createLayerState, defineCatalog, describe as describeLayers } from '../src/catalog/index.js';
import { identify } from '../src/identify/index.js';
import type { IdentifyOptions, IdentifyQuery, IdentifyResult } from '../src/identify/index.js';
import { createOgcClient } from '../src/ogc/index.js';
import type { Feature } from '../src/ogc/index.js';
import { json, mockFetch } from './helpers.js';
import { GS } from './layers.js';

const LON = -103.35;
const LAT = 20.67;
const EAST_40_M = 40 / (6378137 * Math.PI / 180);
const NORTH_30_M = 30 * Math.cos(LAT * Math.PI / 180) / 6378137 * 180 / Math.PI;

const square = (half: number): number[][] => [
    [LON - half, LAT - half], [LON + half, LAT - half], [LON + half, LAT + half], [LON - half, LAT + half], [LON - half, LAT - half],
];

const place = (id: string, geometry: unknown) => ({ type: 'Feature', id, geometry, properties: { id } });

const places = [
    place('here', { type: 'Point', coordinates: [LON, LAT] }),
    place('near', { type: 'MultiPoint', coordinates: [[-100, 20], [LON + EAST_40_M, LAT]] }),
    place('far', { type: 'Point', coordinates: [-100, 20] }),
    place('street', { type: 'LineString', coordinates: [[LON - 0.01, LAT + NORTH_30_M], [LON + 0.01, LAT + NORTH_30_M]] }),
    place('block', { type: 'Polygon', coordinates: [square(0.01)] }),
    place('donut', { type: 'MultiPolygon', coordinates: [[square(0.02), square(0.005)]] }),
    place('bag', { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [0, 0] }, { type: 'Point', coordinates: [LON, LAT] }] }),
];

const catalog = defineCatalog([
    { id: 'places', kind: 'geojson', data: { type: 'FeatureCollection', features: places }, capabilities: ['identify'] },
    { id: 'remote', kind: 'geojson', data: 'https://example.org/remote.geojson', capabilities: ['identify'] },
    { id: 'roads', kind: 'vector-tiles', tiles: { url: 'https://tiles.example.org/{z}/{x}/{y}.pbf', sourceLayer: 'roads' }, capabilities: ['identify'] },
    { id: 'quiet', kind: 'geojson', data: { type: 'FeatureCollection', features: places } },
    { id: 'states', kind: 'wms', wms: { url: GS, layers: 'topp:states' }, capabilities: ['identify'] },
]);

const options = (extra: Partial<IdentifyOptions> = {}): IdentifyOptions => {
    const layers = createLayerState(catalog, { active: ['places', 'remote', 'roads', 'quiet', 'states'] });
    return {
        client: createOgcClient({ fetch: mockFetch(() => json({ type: 'FeatureCollection', features: [] })).fetch }),
        catalog,
        descriptions: describeLayers(catalog, layers.getSnapshot()),
        at: { coordinate: [LON, LAT], pixel: [100, 100], resolution: 10, size: [200, 200], bbox: [0, 0, 2000, 2000] },
        ...extra,
    };
};

const collect = async (source: AsyncIterable<IdentifyResult>): Promise<IdentifyResult[]> => {
    const results: IdentifyResult[] = [];
    for await (const result of source) results.push(result);
    return results;
};

const ids = (result: IdentifyResult | undefined): unknown[] => (result && 'features' in result ? result.features.map(feature => feature.id) : []);

describe('identify on GeoJSON', () => {
    it('hits what is drawn under the pointer within the tolerance, top first, before WMS answers', async () => {
        const results = await collect(identify(options({ featureCount: 20 })));
        expect(results.map(result => result.layerId)).toEqual(['places', 'states']);
        expect(ids(results[0])).toEqual(['bag', 'block', 'street', 'near', 'here']);
        expect(results[0]).toMatchObject({ more: false });
        const tight = await collect(identify(options({ tolerance: 2, layers: ['places'] })));
        expect(ids(tight[0])).toEqual(['bag', 'block', 'here']);
    });

    it('caps at featureCount and flags more', async () => {
        const [result] = await collect(identify(options({ featureCount: 2, layers: ['places'] })));
        expect(ids(result)).toEqual(['bag', 'block']);
        expect(result).toMatchObject({ more: true });
    });

    it('works in geographic coordinates and reports a CRS it cannot use', async () => {
        const at = { coordinate: [LON, LAT] as [number, number], pixel: [0, 0] as [number, number], resolution: 0.0001, size: [1, 1] as [number, number], bbox: [0, 0, 1, 1] as [number, number, number, number] };
        const [geographic] = await collect(identify(options({ layers: ['places'], at: { ...at, crs: 'CRS:84' } })));
        expect(ids(geographic)).toEqual(['bag', 'block', 'street', 'near', 'here']);
        const [unknown] = await collect(identify(options({ layers: ['places'], at: { ...at, crs: 'EPSG:32613' } })));
        expect(unknown && 'error' in unknown ? unknown.error.message : '').toMatch(/EPSG:32613/);
    });
});

describe('identify with a query callback', () => {
    it('asks the callback first and falls back to the inline data', async () => {
        const road: Feature = { type: 'Feature', id: 7, geometry: null, properties: { name: 'Main' } };
        const query = vi.fn<IdentifyQuery>((layerId) => (layerId === 'roads' ? Promise.resolve([road]) : layerId === 'remote' ? undefined : null));
        const results = await collect(identify(options({ query, tolerance: 8, layers: ['places', 'remote', 'roads', 'quiet'] })));
        expect(results.map(result => result.layerId)).toEqual(['places', 'roads']);
        expect(results[1]).toEqual({ layerId: 'roads', features: [road], more: false });
        expect(query.mock.calls.map(call => [call[0], call[2]])).toEqual([['places', 8], ['remote', 8], ['roads', 8]]);
        expect(query.mock.calls[0]?.[1].coordinate).toEqual([LON, LAT]);
    });

    it('turns a failing callback into an error for that layer only', async () => {
        const query: IdentifyQuery = (layerId) => {
            if (layerId === 'roads') throw new Error('no style');
            return null;
        };
        const results = await collect(identify(options({ query, layers: ['places', 'roads'] })));
        const failed = results.find(result => result.layerId === 'roads');
        expect(failed && 'error' in failed ? failed.error.message : '').toBe('no style');
        expect(ids(results.find(result => result.layerId === 'places'))).toHaveLength(5);
    });
});
