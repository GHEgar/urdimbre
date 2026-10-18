import { describe, expect, it } from 'vitest';
import { createOgcClient, OgcError } from '../src/ogc/index.js';
import { fixture, json, mockFetch, query, text } from './helpers.js';

const WFS = 'https://gs-stable.geosolutionsgroup.com/geoserver/wfs';

describe('wfsDescribe', () => {
    it('reads the GeoServer JSON schema', async () => {
        const mock = mockFetch(() => text(fixture('geoserver-describe.json'), 200, 'application/json'));
        const client = createOgcClient({ fetch: mock.fetch });
        const schema = await client.wfsDescribe(WFS, 'topp:states');
        expect(mock.calls[0]?.url).toBe(`${WFS}?OUTPUTFORMAT=application/json&REQUEST=DescribeFeatureType&SERVICE=WFS&TYPENAMES=topp:states&VERSION=2.0.0`);
        expect(schema.typeName).toBe('topp:states');
        expect(schema.geometry).toEqual({ name: 'the_geom', type: 'MultiPolygon' });
        expect(schema.fields).toHaveLength(22);
        expect(schema.fields[0]).toEqual({ name: 'STATE_NAME', type: 'string', nillable: true });
        expect(schema.fields.find(field => field.name === 'PERSONS')?.type).toBe('number');
    });

    it('fails when there are no properties', async () => {
        const mock = mockFetch(() => json({ featureTypes: [] }));
        await expect(createOgcClient({ fetch: mock.fetch }).wfsDescribe(WFS, 'a:b')).rejects.toThrow(OgcError);
    });
});

describe('wfsGetFeature', () => {
    it('builds a canonical GET and returns the collection', async () => {
        const mock = mockFetch(() => text(fixture('geoserver-features.json'), 200, 'application/json'));
        const client = createOgcClient({ fetch: mock.fetch });
        const collection = await client.wfsGetFeature(WFS, {
            typeName: 'topp:states',
            propertyNames: ['STATE_NAME', 'STATE_ABBR', 'PERSONS'],
            sortBy: [{ field: 'STATE_NAME' }],
            count: 2,
            srsName: 'EPSG:4326',
        });
        expect(query(mock.calls[0]?.url ?? '')).toEqual({
            COUNT: '2',
            OUTPUTFORMAT: 'application/json',
            PROPERTYNAME: 'STATE_NAME,STATE_ABBR,PERSONS',
            REQUEST: 'GetFeature',
            SERVICE: 'WFS',
            SORTBY: 'STATE_NAME ASC',
            SRSNAME: 'EPSG:4326',
            TYPENAMES: 'topp:states',
            VERSION: '2.0.0',
        });
        expect(collection.features).toHaveLength(2);
        expect(collection.numberMatched).toBe(49);
    });

    it('rejects startIndex without sortBy before touching the network', async () => {
        const mock = mockFetch(() => json({ type: 'FeatureCollection', features: [] }));
        const client = createOgcClient({ fetch: mock.fetch });
        await expect(client.wfsGetFeature(WFS, { typeName: 'topp:states', startIndex: 10 })).rejects.toThrow(/startIndex needs sortBy/);
        expect(mock.calls).toHaveLength(0);
    });

    it('sends a bbox alone as BBOX and with CQL inside the filter', async () => {
        const mock = mockFetch(() => json({ type: 'FeatureCollection', features: [] }));
        const client = createOgcClient({ fetch: mock.fetch });
        await client.wfsGetFeature(WFS, { typeName: 'a:b', bbox: [1.1234567, 2, 3, 4], srsName: 'EPSG:4326' });
        expect(query(mock.calls[0]?.url ?? '').BBOX).toBe('1.123457,2,3,4,EPSG:4326');
        await client.wfsGetFeature(WFS, { typeName: 'a:b', bbox: [1, 2, 3, 4], srsName: 'EPSG:4326', cql: 'x = 1', geometryName: 'geom' });
        const second = query(mock.calls[1]?.url ?? '');
        expect(second.BBOX).toBeUndefined();
        expect(second.CQL_FILTER).toBe("(x = 1) AND (BBOX(geom, 1, 2, 3, 4, 'EPSG:4326'))");
        await expect(client.wfsGetFeature(WFS, { typeName: 'a:b', bbox: [1, 2, 3, 4], cql: 'x = 1' })).rejects.toThrow(/geometryName/);
    });

    it('switches to POST when the URL is longer than maxUrl', async () => {
        const mock = mockFetch(() => json({ type: 'FeatureCollection', features: [] }));
        const client = createOgcClient({ fetch: mock.fetch, maxUrl: 200 });
        const cql = `code IN (${Array.from({ length: 60 }, (_, index) => `'${index}'`).join(', ')})`;
        await client.wfsGetFeature(`${WFS}?map=x`, { typeName: 'a:b', cql });
        const call = mock.calls[0];
        expect(call?.url).toBe(WFS);
        expect(call?.init.method).toBe('POST');
        expect(new Headers(call?.init.headers).get('Content-Type')).toBe('application/x-www-form-urlencoded');
        const body = new URLSearchParams(String(call?.init.body));
        expect(body.get('CQL_FILTER')).toBe(cql);
        expect(body.get('MAP')).toBe('x');
        expect(body.get('REQUEST')).toBe('GetFeature');
    });

    it('keeps short requests as GET with the default limit of 2000', async () => {
        const mock = mockFetch(() => json({ type: 'FeatureCollection', features: [] }));
        await createOgcClient({ fetch: mock.fetch }).wfsGetFeature(WFS, { typeName: 'a:b', cql: 'x'.repeat(1500) });
        expect(mock.calls[0]?.init.method).toBeUndefined();
        await createOgcClient({ fetch: mock.fetch }).wfsGetFeature(WFS, { typeName: 'a:b', cql: 'x'.repeat(2000) });
        expect(mock.calls[1]?.init.method).toBe('POST');
    });

    it('does not cache GetFeature', async () => {
        const mock = mockFetch(() => json({ type: 'FeatureCollection', features: [] }));
        const client = createOgcClient({ fetch: mock.fetch });
        await client.wfsGetFeature(WFS, { typeName: 'a:b' });
        await client.wfsGetFeature(WFS, { typeName: 'a:b' });
        expect(mock.calls).toHaveLength(2);
    });

    it('rejects a JSON body that is not a collection', async () => {
        const mock = mockFetch(() => json({ hello: 'world' }));
        await expect(createOgcClient({ fetch: mock.fetch }).wfsGetFeature(WFS, { typeName: 'a:b' })).rejects.toThrow(/FeatureCollection/);
    });
});

describe('wfsHits', () => {
    it('reads numberMatched from the hits response', async () => {
        const mock = mockFetch(() => text(fixture('geoserver-hits.xml')));
        const hits = await createOgcClient({ fetch: mock.fetch }).wfsHits(WFS, { typeName: 'topp:states', cql: "SUB_REGION = 'Pacific'", sortBy: 'STATE_NAME' });
        expect(hits).toBe(49);
        const params = query(mock.calls[0]?.url ?? '');
        expect(params.RESULTTYPE).toBe('hits');
        expect(params.OUTPUTFORMAT).toBeUndefined();
        expect(params.SORTBY).toBeUndefined();
        expect(params.CQL_FILTER).toBe("SUB_REGION = 'Pacific'");
    });
});

describe('wfsPages', () => {
    const features = (from: number, to: number): unknown[] =>
        Array.from({ length: to - from }, (_, index) => ({ type: 'Feature', id: from + index, geometry: null, properties: {} }));

    it('walks the pages with startIndex until numberMatched', async () => {
        const mock = mockFetch(url => {
            const params = query(url);
            const start = Number(params.STARTINDEX);
            const end = Math.min(start + Number(params.COUNT), 25);
            return json({ type: 'FeatureCollection', features: features(start, end), numberMatched: 25 });
        });
        const client = createOgcClient({ fetch: mock.fetch });
        const pages: number[] = [];
        for await (const page of client.wfsPages(WFS, { typeName: 'a:b', sortBy: 'id', pageSize: 10 })) pages.push(page.features.length);
        expect(pages).toEqual([10, 10, 5]);
        expect(mock.calls.map(call => query(call.url).STARTINDEX)).toEqual(['0', '10', '20']);
    });

    it('stops at count and on a short page', async () => {
        const mock = mockFetch(url => {
            const params = query(url);
            const start = Number(params.STARTINDEX);
            return json({ type: 'FeatureCollection', features: features(start, Math.min(start + Number(params.COUNT), 100)) });
        });
        const client = createOgcClient({ fetch: mock.fetch });
        const sizes: number[] = [];
        for await (const page of client.wfsPages(WFS, { typeName: 'a:b', sortBy: 'id', pageSize: 10, count: 25 })) sizes.push(page.features.length);
        expect(sizes).toEqual([10, 10, 5]);
        expect(query(mock.calls[2]?.url ?? '').COUNT).toBe('5');
    });

    it('needs sortBy', async () => {
        const mock = mockFetch(() => json({ type: 'FeatureCollection', features: [] }));
        const pages = createOgcClient({ fetch: mock.fetch }).wfsPages(WFS, { typeName: 'a:b', pageSize: 10 });
        await expect(pages[Symbol.asyncIterator]().next()).rejects.toThrow(/sortBy/);
    });
});
