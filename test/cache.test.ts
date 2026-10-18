import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOgcClient } from '../src/ogc/index.js';
import { fixture, mockFetch, text } from './helpers.js';

const WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi';

const deferred = (): { promise: Promise<Response>; resolve: (response: Response) => void } => {
    let resolve: (response: Response) => void = () => undefined;
    const promise = new Promise<Response>(done => {
        resolve = done;
    });
    return { promise, resolve };
};

afterEach(() => {
    vi.useRealTimers();
});

describe('cache', () => {
    it('makes one fetch for two equal calls written differently', async () => {
        const mock = mockFetch(() => text(fixture('gibs-capabilities.xml')));
        const client = createOgcClient({ fetch: mock.fetch });
        const first = await client.wmsCapabilities(WMS);
        const second = await client.wmsCapabilities(`${WMS}?`);
        expect(mock.calls).toHaveLength(1);
        expect(mock.calls[0]?.url).toBe(`${WMS}?REQUEST=GetCapabilities&SERVICE=WMS&VERSION=1.3.0`);
        expect(second).toBe(first);
    });

    it('reuses a request in flight', async () => {
        const pending = deferred();
        const mock = mockFetch(() => pending.promise);
        const client = createOgcClient({ fetch: mock.fetch });
        const first = client.wfsDescribe('https://example.org/wfs', 'a:b');
        const second = client.wfsDescribe('https://example.org/wfs', 'a:b');
        pending.resolve(text(fixture('geoserver-describe.json'), 200, 'application/json'));
        const [a, b] = await Promise.all([first, second]);
        expect(mock.calls).toHaveLength(1);
        expect(a).toBe(b);
    });

    it('empties with clear()', async () => {
        const mock = mockFetch(() => text(fixture('gibs-capabilities.xml')));
        const client = createOgcClient({ fetch: mock.fetch });
        await client.wmsCapabilities(WMS);
        client.clear();
        await client.wmsCapabilities(WMS);
        expect(mock.calls).toHaveLength(2);
    });

    it('expires after the ttl', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(0);
        const mock = mockFetch(() => text(fixture('gibs-capabilities.xml')));
        const client = createOgcClient({ fetch: mock.fetch, ttl: 1000 });
        await client.wmsCapabilities(WMS);
        vi.setSystemTime(999);
        await client.wmsCapabilities(WMS);
        expect(mock.calls).toHaveLength(1);
        vi.setSystemTime(1000);
        await client.wmsCapabilities(WMS);
        expect(mock.calls).toHaveLength(2);
    });

    it('does not keep failures', async () => {
        let attempt = 0;
        const mock = mockFetch(() => {
            attempt += 1;
            return attempt === 1 ? text('', 500) : text(fixture('gibs-capabilities.xml'));
        });
        const client = createOgcClient({ fetch: mock.fetch });
        await expect(client.wmsCapabilities(WMS)).rejects.toThrow('HTTP 500');
        await expect(client.wmsCapabilities(WMS)).resolves.toMatchObject({ version: '1.3.0' });
        expect(mock.calls).toHaveLength(2);
    });

    it('aborts one waiter without cancelling the shared request', async () => {
        const pending = deferred();
        const mock = mockFetch(() => pending.promise);
        const client = createOgcClient({ fetch: mock.fetch });
        const controller = new AbortController();
        const first = client.wmsCapabilities(WMS, { signal: controller.signal });
        const second = client.wmsCapabilities(WMS);
        controller.abort();
        await expect(first).rejects.toMatchObject({ name: 'AbortError' });
        expect(mock.calls[0]?.init.signal?.aborted).toBe(false);
        pending.resolve(text(fixture('gibs-capabilities.xml')));
        await expect(second).resolves.toMatchObject({ version: '1.3.0' });
    });

    it('cancels the fetch when every waiter aborts and starts again later', async () => {
        const mock = mockFetch((_, init) => new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }));
        const client = createOgcClient({ fetch: mock.fetch });
        const controller = new AbortController();
        const call = client.wmsCapabilities(WMS, { signal: controller.signal });
        controller.abort();
        await expect(call).rejects.toMatchObject({ name: 'AbortError' });
        expect(mock.calls[0]?.init.signal?.aborted).toBe(true);
        void client.wmsCapabilities(WMS).catch(() => undefined);
        expect(mock.calls).toHaveLength(2);
    });

    it('rejects at once with an aborted signal', async () => {
        const mock = mockFetch(() => text(fixture('gibs-capabilities.xml')));
        await expect(createOgcClient({ fetch: mock.fetch }).wmsCapabilities(WMS, { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' });
        expect(mock.calls).toHaveLength(0);
    });

    it('does not touch the network when it is created', () => {
        const mock = mockFetch(() => text(''));
        createOgcClient({ fetch: mock.fetch });
        expect(mock.calls).toHaveLength(0);
    });
});
