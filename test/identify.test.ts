import { describe, expect, it } from 'vitest';
import { createLayerState, defineCatalog, describe as describeLayers } from '../src/catalog/index.js';
import { identify } from '../src/identify/index.js';
import type { IdentifyOptions, IdentifyResult } from '../src/identify/index.js';
import { createOgcClient } from '../src/ogc/index.js';
import { json, mockFetch, query } from './helpers.js';
import type { Responder } from './helpers.js';
import { GS } from './layers.js';

const OTHER = 'https://maps.example.org/wms';

const catalog = defineCatalog({ layers: [
    { id: 'states', kind: 'wms', wms: { url: GS, layers: 'topp:states', styles: 'polygon' }, capabilities: ['identify'] },
    { id: 'roads', kind: 'wms', wms: { url: GS, layers: 'tiger:roads' }, capabilities: ['identify'] },
    { id: 'storms', kind: 'wms', wms: { url: GS, layers: 'geosolutions:storms' }, dimensions: { time: { default: '1990-07-22' } }, capabilities: ['time', 'identify'] },
    { id: 'rivers', kind: 'wms', wms: { url: OTHER, layers: 'hydro:rivers' }, capabilities: ['identify'] },
    { id: 'plain', kind: 'wms', wms: { url: GS, layers: 'topp:plain' } },
    { id: 'hidden', kind: 'wms', wms: { url: GS, layers: 'topp:hidden' }, capabilities: ['identify'] },
    { id: 'osm', kind: 'xyz', tiles: { url: 'https://tile.example.org/{z}/{x}/{y}.png' }, capabilities: ['identify'] },
] });

const feature = (id: string) => ({ type: 'Feature', id, geometry: null, properties: { id } });

const options = (fetcher: typeof fetch, extra: Partial<IdentifyOptions> = {}): IdentifyOptions => {
    const layers = createLayerState(catalog, { active: ['states', 'roads', 'storms', 'rivers', 'plain', 'hidden', 'osm'] });
    layers.composer('states').set('table', 'PERSONS > 100');
    layers.setVisible('hidden', false);
    return {
        client: createOgcClient({ fetch: fetcher }),
        catalog,
        descriptions: describeLayers(catalog, layers.getSnapshot()),
        at: { coordinate: [-100, 40], pixel: [128.4, 64], resolution: 1000, size: [256, 256], bbox: [-1, -2, 3, 4] },
        ...extra,
    };
};

const collect = async (source: AsyncIterable<IdentifyResult>): Promise<IdentifyResult[]> => {
    const results: IdentifyResult[] = [];
    for await (const result of source) results.push(result);
    return results;
};

const deferred = () => {
    const waiting = new Map<string, (response: Response) => void>();
    const responder: Responder = url => new Promise(resolve => waiting.set(query(url).LAYERS ?? '', resolve));
    return { waiting, responder };
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('identify', () => {
    it('makes one GetFeatureInfo per service and dimensions, with TIME and one CQL per layer', async () => {
        const mock = mockFetch(() => json({ type: 'FeatureCollection', features: [] }));
        await collect(identify(options(mock.fetch)));
        const requests = mock.calls.map(call => query(call.url)).sort((a, b) => (a.LAYERS ?? '').localeCompare(b.LAYERS ?? ''));
        expect(requests).toHaveLength(3);
        expect(requests[0]).toMatchObject({ LAYERS: 'geosolutions:storms', QUERY_LAYERS: 'geosolutions:storms', TIME: '1990-07-22' });
        expect(requests[0]?.CQL_FILTER).toBeUndefined();
        expect(requests[1]).toMatchObject({ LAYERS: 'hydro:rivers' });
        expect(requests[2]).toEqual({
            BBOX: '-1,-2,3,4', CQL_FILTER: 'PERSONS > 100;INCLUDE', CRS: 'EPSG:3857', FEATURE_COUNT: '10', HEIGHT: '256', I: '128',
            INFO_FORMAT: 'application/json', J: '64', LAYERS: 'topp:states,tiger:roads', QUERY_LAYERS: 'topp:states,tiger:roads',
            REQUEST: 'GetFeatureInfo', SERVICE: 'WMS', STYLES: 'polygon,', VERSION: '1.3.0', WIDTH: '256',
        });
    });

    it('splits a grouped answer by layer and flags more when featureCount is reached', async () => {
        const mock = mockFetch(url => json({ type: 'FeatureCollection', features: query(url).LAYERS === 'topp:states,tiger:roads'
            ? [feature('states.1'), feature('roads.7'), feature('states.2')]
            : [feature('x.1')] }));
        const results = await collect(identify(options(mock.fetch, { featureCount: 3 })));
        const byLayer = Object.fromEntries(results.map(result => [result.layerId, result]));
        expect(byLayer.states).toEqual({ layerId: 'states', features: [feature('states.1'), feature('states.2')], more: true });
        expect(byLayer.roads).toEqual({ layerId: 'roads', features: [feature('roads.7')], more: true });
        expect(byLayer.rivers).toEqual({ layerId: 'rivers', features: [feature('x.1')], more: false });
        expect(Object.keys(byLayer).sort()).toEqual(['rivers', 'roads', 'states', 'storms']);
    });

    it('asks again only for the chosen layers', async () => {
        const mock = mockFetch(() => json({ type: 'FeatureCollection', features: [] }));
        const results = await collect(identify(options(mock.fetch, { layers: ['roads'], featureCount: 50 })));
        expect(mock.calls.map(call => query(call.url))).toMatchObject([{ LAYERS: 'tiger:roads', FEATURE_COUNT: '50' }]);
        expect(results).toEqual([{ layerId: 'roads', features: [], more: false }]);
    });

    it('yields each service as soon as it answers', async () => {
        const { waiting, responder } = deferred();
        const iterator = identify(options(mockFetch(responder).fetch))[Symbol.asyncIterator]();
        const next = iterator.next();
        await flush();
        expect([...waiting.keys()].sort()).toEqual(['geosolutions:storms', 'hydro:rivers', 'topp:states,tiger:roads']);
        waiting.get('hydro:rivers')?.(json({ type: 'FeatureCollection', features: [feature('rivers.1')] }));
        expect(await next).toEqual({ done: false, value: { layerId: 'rivers', features: [feature('rivers.1')], more: false } });
        waiting.get('geosolutions:storms')?.(json({ type: 'FeatureCollection', features: [] }));
        expect((await iterator.next()).value).toMatchObject({ layerId: 'storms' });
        waiting.get('topp:states,tiger:roads')?.(json({ type: 'FeatureCollection', features: [] }));
        expect((await iterator.next()).value).toMatchObject({ layerId: 'states' });
        expect((await iterator.next()).value).toMatchObject({ layerId: 'roads' });
        expect((await iterator.next()).done).toBe(true);
    });

    it('keeps going when one service fails', async () => {
        const mock = mockFetch(url => (query(url).LAYERS === 'hydro:rivers' ? new Response('down', { status: 503 }) : json({ type: 'FeatureCollection', features: [] })));
        const results = await collect(identify(options(mock.fetch)));
        const failed = results.find(result => result.layerId === 'rivers');
        expect(failed && 'error' in failed ? failed.error.message : '').toMatch(/HTTP 503/);
        expect(results.filter(result => 'features' in result).map(result => result.layerId).sort()).toEqual(['roads', 'states', 'storms']);
    });

    it('stops and aborts every request when the signal fires', async () => {
        const { waiting, responder } = deferred();
        const mock = mockFetch(responder);
        const controller = new AbortController();
        const pending = collect(identify(options(mock.fetch, { signal: controller.signal })));
        await flush();
        waiting.get('hydro:rivers')?.(json({ type: 'FeatureCollection', features: [] }));
        await flush();
        controller.abort();
        expect(await pending).toEqual([{ layerId: 'rivers', features: [], more: false }]);
        expect(mock.calls.every(call => call.init.signal?.aborted)).toBe(true);
    });

    it('does nothing with an aborted signal and aborts when the consumer breaks', async () => {
        const mock = mockFetch(() => json({ type: 'FeatureCollection', features: [] }));
        expect(await collect(identify(options(mock.fetch, { signal: AbortSignal.abort() })))).toEqual([]);
        expect(mock.calls).toEqual([]);
        const { waiting, responder } = deferred();
        const slow = mockFetch(responder);
        const results = identify(options(slow.fetch));
        const loop = (async () => {
            for await (const result of results) return result;
            return null;
        })();
        await flush();
        waiting.get('geosolutions:storms')?.(json({ type: 'FeatureCollection', features: [] }));
        expect(await loop).toMatchObject({ layerId: 'storms' });
        expect(slow.calls.every(call => call.init.signal?.aborted)).toBe(true);
    });
});
