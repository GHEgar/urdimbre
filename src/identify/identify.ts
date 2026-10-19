import type { LayerDescription, WmsImageSource, WmsTilesSource } from '../catalog/describe.js';
import type { Catalog } from '../catalog/types.js';
import type { OgcClient } from '../ogc/client.js';
import type { Extent, Feature, FeatureCollection } from '../ogc/types.js';

export interface IdentifyPoint {
    coordinate: [number, number];
    pixel: [number, number];
    resolution: number;
    size: [number, number];
    bbox: Extent;
    crs?: string;
}

export interface IdentifyOptions {
    client: OgcClient;
    catalog: Catalog;
    descriptions: readonly LayerDescription[];
    at: IdentifyPoint;
    signal?: AbortSignal;
    featureCount?: number;
    layers?: readonly string[];
}

export type IdentifyResult =
    | { layerId: string; features: Feature[]; more: boolean }
    | { layerId: string; error: Error };

interface Member {
    id: string;
    name: string;
    style: string;
    cql: string | null;
}

interface Group {
    url: string;
    shared: Record<string, string>;
    members: Member[];
}

export const DEFAULT_FEATURE_COUNT = 10;

const LAYER_PARAMS = new Set(['LAYERS', 'STYLES', 'CQL_FILTER', 'FORMAT', 'TRANSPARENT', 'TILED', 'VERSION']);

const isWms = (source: LayerDescription['source']): source is WmsTilesSource | WmsImageSource =>
    source.type === 'wms-tiles' || source.type === 'wms-image';

const groupLayers = (options: IdentifyOptions): Group[] => {
    const groups = new Map<string, Group>();
    for (const description of options.descriptions) {
        const def = options.catalog.get(description.id);
        const { source } = description;
        if (!def || !description.visible || !isWms(source) || !def.capabilities?.includes('identify')) continue;
        if (options.layers && !options.layers.includes(description.id)) continue;
        const shared = Object.fromEntries(Object.entries(source.params).filter(([key]) => !LAYER_PARAMS.has(key)));
        const key = JSON.stringify([source.url, source.params.VERSION ?? null, shared]);
        const group = groups.get(key) ?? { url: source.url, shared, members: [] };
        group.members.push({ id: description.id, name: source.params.LAYERS ?? '', style: source.params.STYLES ?? '', cql: source.params.CQL_FILTER ?? null });
        groups.set(key, group);
    }
    return [...groups.values()];
};

const localName = (name: string): string => name.split(',')[0]?.split(':').pop()?.trim() ?? '';

const split = (group: Group, collection: FeatureCollection, featureCount: number): IdentifyResult[] => {
    const byLayer = new Map<string, Feature[]>(group.members.map(member => [member.id, []]));
    for (const feature of collection.features) {
        const id = typeof feature.id === 'string' ? feature.id : '';
        const owner = group.members.find(member => id.startsWith(`${localName(member.name)}.`)) ?? group.members[0];
        if (owner) byLayer.get(owner.id)?.push(feature);
    }
    const more = collection.features.length >= featureCount;
    return group.members.map(member => ({ layerId: member.id, features: byLayer.get(member.id) ?? [], more }));
};

const request = async (group: Group, options: IdentifyOptions, featureCount: number, signal: AbortSignal): Promise<IdentifyResult[]> => {
    const { at } = options;
    const names = group.members.map(member => member.name);
    const styles = group.members.map(member => member.style);
    const filters = group.members.map(member => member.cql);
    const { TIME: time, ...params } = group.shared;
    try {
        const collection = await options.client.wmsFeatureInfo(group.url, {
            layers: names,
            queryLayers: names,
            ...(styles.some(Boolean) ? { styles: styles.join(',') } : {}),
            crs: at.crs ?? 'EPSG:3857',
            bbox: at.bbox,
            width: at.size[0],
            height: at.size[1],
            i: at.pixel[0],
            j: at.pixel[1],
            infoFormat: 'application/json',
            featureCount,
            cql: filters.some(Boolean) ? filters.map(filter => filter ?? 'INCLUDE').join(';') : null,
            time: time ?? null,
            params,
        }, { signal });
        return split(group, collection, featureCount);
    } catch (caught) {
        if (signal.aborted) return [];
        const error = caught instanceof Error ? caught : new Error(String(caught));
        return group.members.map(member => ({ layerId: member.id, error }));
    }
};

export const identify = (options: IdentifyOptions): AsyncIterable<IdentifyResult> => ({
    async *[Symbol.asyncIterator]() {
        const controller = new AbortController();
        const abort = (): void => controller.abort(options.signal?.reason);
        if (options.signal?.aborted) return;
        options.signal?.addEventListener('abort', abort, { once: true });
        const featureCount = options.featureCount ?? DEFAULT_FEATURE_COUNT;
        const stopped = new Promise<null>(resolve => controller.signal.addEventListener('abort', () => resolve(null), { once: true }));
        const pending = new Map(groupLayers(options).map((group, index) => [
            index,
            request(group, options, featureCount, controller.signal).then(results => ({ index, results })),
        ]));
        try {
            while (pending.size > 0 && !controller.signal.aborted) {
                const settled = await Promise.race([stopped, ...pending.values()]);
                if (!settled || controller.signal.aborted) return;
                pending.delete(settled.index);
                yield* settled.results;
            }
        } finally {
            options.signal?.removeEventListener('abort', abort);
            controller.abort();
        }
    },
});
