import { describe, expect, it } from 'vitest';
import { createOgcClient, OgcError } from '../src/ogc/index.js';
import { fixture, json, mockFetch, query, text } from './helpers.js';

const GS = 'https://gs-stable.geosolutionsgroup.com/geoserver';

describe('wmsCapabilities', () => {
    it('fetches and parses the capabilities with the client headers', async () => {
        const mock = mockFetch(() => text(fixture('geoserver-capabilities.xml')));
        const client = createOgcClient({ fetch: mock.fetch, headers: { Authorization: 'Bearer x' } });
        const capabilities = await client.wmsCapabilities(`${GS}/wms`);
        expect(capabilities.layers[0]?.children).toHaveLength(3);
        expect(new Headers(mock.calls[0]?.init.headers).get('Authorization')).toBe('Bearer x');
    });
});

describe('wmsFeatureInfo', () => {
    it('sends TIME as its own parameter, never inside the CQL', async () => {
        const mock = mockFetch(() => text(fixture('geoserver-feature-info.json'), 200, 'application/json'));
        const client = createOgcClient({ fetch: mock.fetch });
        const collection = await client.wmsFeatureInfo(`${GS}/wms`, {
            layers: 'topp:states',
            crs: 'EPSG:4326',
            bbox: [30, -100, 40, -90],
            width: 101,
            height: 101,
            i: 50,
            j: 50.4,
            featureCount: 1,
            cql: "STATE_ABBR = 'AR'",
            time: '2020-01-01',
        });
        expect(query(mock.calls[0]?.url ?? '')).toEqual({
            BBOX: '30,-100,40,-90',
            CQL_FILTER: "STATE_ABBR = 'AR'",
            CRS: 'EPSG:4326',
            FEATURE_COUNT: '1',
            HEIGHT: '101',
            I: '50',
            INFO_FORMAT: 'application/json',
            J: '50',
            LAYERS: 'topp:states',
            QUERY_LAYERS: 'topp:states',
            REQUEST: 'GetFeatureInfo',
            SERVICE: 'WMS',
            TIME: '2020-01-01',
            VERSION: '1.3.0',
            WIDTH: '101',
        });
        expect(collection.features[0]?.properties?.STATE_NAME).toBe('Oklahoma');
    });
});

describe('wpsUnique', () => {
    it('posts gs:PagedUnique and returns the values as strings', async () => {
        const mock = mockFetch(() => json({ featureTypeName: 'states', fieldName: 'SUB_REGION', size: 3, values: ['E N Cen', 'Mtn', null, 5] }));
        const client = createOgcClient({ fetch: mock.fetch });
        const values = await client.wpsUnique(`${GS}/wps`, 'topp:states', 'SUB_REGION', { cql: "STATE_ABBR <> 'TX'", limit: 50 });
        expect(values).toEqual(['E N Cen', 'Mtn', '5']);
        const call = mock.calls[0];
        expect(call?.url).toBe(`${GS}/wps`);
        expect(call?.init.method).toBe('POST');
        expect(new Headers(call?.init.headers).get('Content-Type')).toBe('text/xml');
        const body = String(call?.init.body);
        expect(body).toContain('<ows:Identifier>gs:PagedUnique</ows:Identifier>');
        expect(body).toContain('<wps:LiteralData>SUB_REGION</wps:LiteralData>');
        expect(body).toContain('<wps:LiteralData>50</wps:LiteralData>');
        expect(body).toContain('TYPENAME=topp:states');
        expect(body).toContain('CQL_FILTER=STATE_ABBR%20%3C%3E%20&apos;TX&apos;');
    });

    it('turns a WPS exception into an OgcError', async () => {
        const report = '<?xml version="1.0"?><wps:ExecuteResponse xmlns:wps="http://www.opengis.net/wps/1.0.0" xmlns:ows="http://www.opengis.net/ows/1.1"><wps:Status><wps:ProcessFailed><ows:ExceptionReport><ows:Exception exceptionCode="NoApplicableCode"><ows:ExceptionText>Unknown field X</ows:ExceptionText></ows:Exception></ows:ExceptionReport></wps:ProcessFailed></wps:Status></wps:ExecuteResponse>';
        const mock = mockFetch(() => text(report));
        const error = await createOgcClient({ fetch: mock.fetch }).wpsUnique(`${GS}/wps`, 'topp:states', 'X').catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(OgcError);
        expect((error as OgcError).message).toBe('Unknown field X');
    });
});
