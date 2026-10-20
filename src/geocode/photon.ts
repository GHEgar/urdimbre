import { normalizeName } from './normalize.js';
import type { Coordinate, Place, SearchOptions } from './types.js';

export interface PhotonOptions {
    url?: string;
    fetch?: typeof fetch;
    lang?: string;
    cacheSize?: number;
}

export interface PhotonSearchOptions extends SearchOptions {
    bbox?: readonly [number, number, number, number];
    radius?: number;
    signal?: AbortSignal;
}

export interface PhotonClient {
    searchUrl(query: string, options?: PhotonSearchOptions): string;
    search(query: string, options?: PhotonSearchOptions): Promise<Place[]>;
}

interface PhotonFeature {
    geometry?: { coordinates?: [number, number] };
    properties?: Record<string, unknown>;
}

const DEFAULT_URL = 'https://photon.komoot.io/api/';

const round = (value: number): string => String(Math.round(value * 1e4) / 1e4);

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

const detailOf = (properties: Record<string, unknown>, name: string): string | undefined => {
    const street = text(properties.street);
    const parts = [
        street ? [street, text(properties.housenumber)].filter(Boolean).join(' ') : undefined,
        text(properties.district) ?? text(properties.locality),
        text(properties.city),
        text(properties.state),
    ].filter((part): part is string => Boolean(part));
    const unique = [...new Set(parts)].filter(part => part !== name);
    return unique.length ? unique.join(' · ') : undefined;
};

export const placeFromPhoton = (feature: PhotonFeature): Place | null => {
    const coordinates = feature.geometry?.coordinates;
    const properties = feature.properties ?? {};
    if (!coordinates || coordinates.length < 2) return null;
    const name = text(properties.name) ?? [text(properties.street), text(properties.housenumber)].filter(Boolean).join(' ');
    if (!name) return null;
    const extent = properties.extent;
    const detail = detailOf(properties, name);
    return {
        name,
        kind: text(properties.osm_value) ?? text(properties.type) ?? 'place',
        coordinate: [coordinates[0], coordinates[1]] as Coordinate,
        ...(detail ? { detail } : {}),
        ...(Array.isArray(extent) && extent.length === 4 ? { bbox: [Number(extent[0]), Number(extent[3]), Number(extent[2]), Number(extent[1])] as const } : {}),
        source: 'photon',
    };
};

export const createPhotonClient = (options: PhotonOptions = {}): PhotonClient => {
    const base = options.url ?? DEFAULT_URL;
    const cache = new Map<string, Place[]>();
    const cacheSize = options.cacheSize ?? 50;
    const searchUrl = (query: string, { limit = 6, near, bbox, radius }: PhotonSearchOptions = {}): string => {
        const box = bbox ?? (near && radius ? [near[0] - radius, near[1] - radius, near[0] + radius, near[1] + radius] as const : undefined);
        const params: [string, string][] = [['q', query.trim().replace(/\s+/g, ' ')], ['limit', String(limit)]];
        if (options.lang) params.push(['lang', options.lang]);
        if (near) params.push(['lat', round(near[1])], ['lon', round(near[0])]);
        if (box) params.push(['bbox', box.map(round).join(',')]);
        params.sort(([a], [b]) => a.localeCompare(b));
        const url = new URL(base, 'http://localhost');
        url.search = new URLSearchParams(params).toString();
        return /^[a-z][a-z0-9+.-]*:/i.test(base) ? url.toString() : `${url.pathname}${url.search}`;
    };
    return {
        searchUrl,
        async search(query, searchOptions = {}) {
            if (!normalizeName(query)) return [];
            const url = searchUrl(query, searchOptions);
            const cached = cache.get(url);
            if (cached) return cached;
            const fetcher = options.fetch ?? globalThis.fetch;
            const response = await fetcher(url, searchOptions.signal ? { signal: searchOptions.signal } : {});
            if (!response.ok) throw new Error(`Photon responded ${response.status}`);
            const body = await response.json() as { features?: PhotonFeature[] };
            const places = (body.features ?? []).map(placeFromPhoton).filter((place): place is Place => place !== null);
            cache.set(url, places);
            if (cache.size > cacheSize) cache.delete(cache.keys().next().value as string);
            return places;
        },
    };
};
