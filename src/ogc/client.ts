import { createRequestCache } from './cache.js';
import { canonicalQuery, canonicalUrl, splitUrl } from './canonical.js';
import { parseWmsCapabilities } from './capabilities.js';
import { OgcError, isExceptionReport, readException } from './errors.js';
import type { FeatureCollection, FeatureInfoRequest, FeatureSchema, GetFeatureRequest, RequestOptions, UniqueOptions, WmsCapabilities } from './types.js';
import { describeParams, getFeatureParams, parseHits, parseSchema } from './wfs.js';
import { pagedUniqueXml, parseUnique } from './wps.js';

export interface OgcClientOptions {
    fetch?: typeof fetch;
    headers?: HeadersInit;
    ttl?: number;
    maxUrl?: number;
}

export interface OgcClient {
    wmsCapabilities(url: string, opts?: RequestOptions): Promise<WmsCapabilities>;
    wmsFeatureInfo(url: string, req: FeatureInfoRequest, opts?: RequestOptions): Promise<FeatureCollection>;
    wfsDescribe(url: string, typeName: string, opts?: RequestOptions): Promise<FeatureSchema>;
    wfsGetFeature(url: string, req: GetFeatureRequest, opts?: RequestOptions): Promise<FeatureCollection>;
    wfsHits(url: string, req: Omit<GetFeatureRequest, 'startIndex' | 'count'>, opts?: RequestOptions): Promise<number>;
    wfsPages(url: string, req: GetFeatureRequest & { pageSize: number }, opts?: RequestOptions): AsyncIterable<FeatureCollection>;
    wpsUnique(url: string, typeName: string, field: string, opts?: UniqueOptions): Promise<string[]>;
    clear(): void;
}

interface Call {
    url: string;
    target: string;
    body?: string;
    contentType?: string;
}

export const DEFAULT_TTL = 300_000;
export const DEFAULT_MAX_URL = 2000;

const asList = (value: string | readonly string[] | undefined): readonly string[] | undefined =>
    typeof value === 'string' ? [value] : value;

const featureInfoParams = (req: FeatureInfoRequest): Record<string, unknown> => ({
    ...req.params,
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    LAYERS: asList(req.layers),
    QUERY_LAYERS: asList(req.queryLayers ?? req.layers),
    STYLES: asList(req.styles),
    CRS: req.crs,
    BBOX: req.bbox,
    WIDTH: Math.round(req.width),
    HEIGHT: Math.round(req.height),
    I: Math.round(req.i),
    J: Math.round(req.j),
    INFO_FORMAT: req.infoFormat ?? 'application/json',
    FEATURE_COUNT: req.featureCount,
    CQL_FILTER: req.cql,
    TIME: req.time,
});

const readJson = (text: string, url: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        throw new OgcError(readException(text)?.message ?? 'The response is not JSON', { url });
    }
};

const asCollection = (json: unknown, url: string): FeatureCollection => {
    const features = (json as { features?: unknown } | null)?.features;
    if (!Array.isArray(features)) throw new OgcError('The response is not a FeatureCollection', { url });
    return json as FeatureCollection;
};

export const createOgcClient = (options: OgcClientOptions = {}): OgcClient => {
    const cache = createRequestCache(options.ttl ?? DEFAULT_TTL);
    const maxUrl = options.maxUrl ?? DEFAULT_MAX_URL;

    const prepare = (base: string, params: Record<string, unknown>): Call => {
        const url = canonicalUrl(base, params);
        if (url.length <= maxUrl) return { url, target: url };
        const split = splitUrl(base);
        return { url, target: split.base, body: canonicalQuery({ ...split.query, ...params }), contentType: 'application/x-www-form-urlencoded' };
    };

    const send = async (call: Call, signal?: AbortSignal): Promise<string> => {
        const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
        const headers = new Headers(options.headers);
        const init: RequestInit = { headers };
        if (call.body !== undefined) {
            init.method = 'POST';
            init.body = call.body;
            headers.set('Content-Type', call.contentType ?? 'text/plain');
        }
        if (signal) init.signal = signal;
        const response = await fetcher(call.target, init);
        const text = await response.text();
        const exception = !response.ok || isExceptionReport(text) ? readException(text) : null;
        if (!response.ok) {
            throw new OgcError(exception?.message ?? `Request failed with HTTP ${response.status}`, { status: response.status, code: exception?.code ?? null, url: call.url });
        }
        if (exception) throw new OgcError(exception.message, { status: response.status, code: exception.code, url: call.url });
        return text;
    };

    const getFeature = async (url: string, req: GetFeatureRequest, signal?: AbortSignal): Promise<FeatureCollection> => {
        const call = prepare(url, getFeatureParams(req));
        return asCollection(readJson(await send(call, signal), call.url), call.url);
    };

    return {
        wmsCapabilities(url, opts = {}) {
            const call = prepare(url, { SERVICE: 'WMS', REQUEST: 'GetCapabilities', VERSION: '1.3.0' });
            return cache.get(call.url, async signal => parseWmsCapabilities(await send(call, signal)), opts.signal);
        },
        async wmsFeatureInfo(url, req, opts = {}) {
            const call = prepare(url, featureInfoParams(req));
            return asCollection(readJson(await send(call, opts.signal), call.url), call.url);
        },
        wfsDescribe(url, typeName, opts = {}) {
            const call = prepare(url, describeParams(typeName));
            return cache.get(call.url, async signal => parseSchema(typeName, readJson(await send(call, signal), call.url)), opts.signal);
        },
        wfsGetFeature: async (url, req, opts = {}) => getFeature(url, req, opts.signal),
        async wfsHits(url, req, opts = {}) {
            const call = prepare(url, getFeatureParams(req, true));
            const text = await send(call, opts.signal);
            const hits = parseHits(text);
            if (hits === null) throw new OgcError('The hits response has no numberMatched', { url: call.url });
            return hits;
        },
        async *wfsPages(url, req, opts = {}) {
            const { pageSize, ...rest } = req;
            if (!Number.isInteger(pageSize) || pageSize <= 0) throw new RangeError('pageSize must be a positive integer');
            const limit = rest.count ?? Infinity;
            let start = rest.startIndex ?? 0;
            let collected = 0;
            while (collected < limit) {
                const count = Math.min(pageSize, limit - collected);
                const page = await getFeature(url, { ...rest, startIndex: start, count }, opts.signal);
                const received = page.features.length;
                collected += received;
                yield page;
                if (received < count) return;
                const matched = page.numberMatched ?? (typeof page.totalFeatures === 'number' ? page.totalFeatures : null);
                start += received;
                if (matched !== null && start >= matched) return;
            }
        },
        async wpsUnique(url, typeName, field, opts = {}) {
            const target = canonicalUrl(url, {});
            const call: Call = { url: target, target, body: pagedUniqueXml(typeName, field, opts.cql, opts.limit), contentType: 'text/xml' };
            const values = parseUnique(readJson(await send(call, opts.signal), target));
            if (values === null) throw new OgcError('The WPS response has no values', { url: target });
            return values;
        },
        clear() {
            cache.clear();
        },
    };
};
