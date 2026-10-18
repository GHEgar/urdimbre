import { describe, expect, it } from 'vitest';
import { createOgcClient, OgcError } from '../src/ogc/index.js';
import { fixture, mockFetch, text } from './helpers.js';

const WMS = 'https://gs-stable.geosolutionsgroup.com/geoserver/wms';

const request = { layers: 'topp:nope', crs: 'EPSG:4326', bbox: [0, 0, 1, 1] as const, width: 10, height: 10, i: 1, j: 1 };

describe('OgcError', () => {
    it('turns a ServiceException answered with 200 into an OgcError', async () => {
        const mock = mockFetch(() => text(fixture('geoserver-service-exception.xml')));
        const error = await createOgcClient({ fetch: mock.fetch }).wmsFeatureInfo(WMS, request).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(OgcError);
        expect((error as OgcError).message).toBe('Could not find layer topp:nope');
        expect((error as OgcError).code).toBe('LayerNotDefined');
        expect((error as OgcError).status).toBe(200);
        expect((error as OgcError).url).toContain('REQUEST=GetFeatureInfo');
    });

    it('reads the ows ExceptionReport of a failed WFS request', async () => {
        const mock = mockFetch(() => text(fixture('geoserver-exception-report.xml'), 400, 'application/xml'));
        const error = await createOgcClient({ fetch: mock.fetch }).wfsGetFeature(WMS, { typeName: 'topp:nope' }).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(OgcError);
        expect((error as OgcError).message).toBe('Feature type topp:nope unknown');
        expect((error as OgcError).code).toBe('InvalidParameterValue');
        expect((error as OgcError).status).toBe(400);
    });

    it('turns a capabilities exception answered with 200 into an OgcError', async () => {
        const mock = mockFetch(() => text(fixture('geoserver-service-exception.xml')));
        await expect(createOgcClient({ fetch: mock.fetch }).wmsCapabilities(WMS)).rejects.toThrow('Could not find layer topp:nope');
    });

    it('reports the HTTP status when the body says nothing', async () => {
        const mock = mockFetch(() => text('', 503));
        await expect(createOgcClient({ fetch: mock.fetch }).wfsDescribe(WMS, 'a:b')).rejects.toThrow('Request failed with HTTP 503');
    });

    it('rejects a body that is not JSON', async () => {
        const mock = mockFetch(() => text('<html>oops</html>', 200, 'text/html'));
        await expect(createOgcClient({ fetch: mock.fetch }).wfsGetFeature(WMS, { typeName: 'a:b' })).rejects.toThrow('The response is not JSON');
    });
});
