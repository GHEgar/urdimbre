import { canonicalParams, canonicalUrl } from '../ogc/canonical.js';
import { getFeatureParams } from '../ogc/wfs.js';
import { fnv1a, stableJson } from '../shared/hash.js';
import type { LayerStateSnapshot } from './state.js';
import type { Catalog, CrossOrigin, LayerDef, LayerKind } from './types.js';
import { compact } from './validate.js';

interface SourceBase {
    attribution?: string;
    crossOrigin?: CrossOrigin;
}

export interface WmsTilesSource extends SourceBase {
    type: 'wms-tiles';
    url: string;
    params: Readonly<Record<string, string>>;
    tileSize: 256 | 512;
}

export interface WmsImageSource extends SourceBase {
    type: 'wms-image';
    url: string;
    params: Readonly<Record<string, string>>;
}

export interface VectorTilesSource extends SourceBase {
    type: 'vector-tiles';
    url: string;
    sourceLayer?: string;
}

export interface PmtilesSource extends SourceBase {
    type: 'pmtiles';
    url: string;
    sourceLayer?: string;
}

export interface GeoJsonSource extends SourceBase {
    type: 'geojson';
    url?: string;
    data?: unknown;
}

export interface XyzSource extends SourceBase {
    type: 'xyz';
    url: string;
}

export type LayerSource = WmsTilesSource | WmsImageSource | VectorTilesSource | PmtilesSource | GeoJsonSource | XyzSource;

export interface LayerDescription {
    id: string;
    kind: LayerKind;
    zIndex: number;
    opacity: number;
    visible: boolean;
    minZoom?: number;
    maxZoom?: number;
    source: LayerSource;
    key: string;
}

export const DATA_Z_BASE = 100;
export const DATA_Z_STEP = 10;
export const TOOL_Z_MIN = 900;
export const TOOL_Z_MAX = 999;

const DIMENSION_PARAMS: Record<string, string> = { time: 'TIME', elevation: 'ELEVATION' };

export const dimensionParam = (name: string): string => DIMENSION_PARAMS[name] ?? `DIM_${name.toUpperCase()}`;

const dimensionValues = (layer: LayerDef, state: LayerStateSnapshot): Record<string, string> => {
    const chosen = state.dimensions[layer.id] ?? {};
    const names = new Set([...Object.keys(layer.dimensions ?? {}), ...Object.keys(chosen)]);
    const params: Record<string, string> = {};
    for (const name of [...names].sort()) {
        const value = chosen[name] ?? layer.dimensions?.[name]?.default;
        if (value !== undefined) params[dimensionParam(name)] = value;
    }
    return params;
};

const ordered = (params: Record<string, unknown>): Readonly<Record<string, string>> => Object.freeze(Object.fromEntries(canonicalParams(params)));

const wmsSource = (layer: LayerDef, state: LayerStateSnapshot): { source: LayerSource; key: string } => {
    const wms = layer.wms as NonNullable<LayerDef['wms']>;
    const tiled = wms.tiled !== false;
    const tileSize = wms.tileSize ?? 256;
    const url = canonicalUrl(wms.url, {});
    const params = ordered({
        ...dimensionValues(layer, state),
        LAYERS: wms.layers,
        STYLES: wms.styles,
        FORMAT: wms.format ?? 'image/png',
        TRANSPARENT: true,
        VERSION: wms.version ?? '1.3.0',
        TILED: tiled ? true : undefined,
        CQL_FILTER: state.cql[layer.id],
    });
    const common = { attribution: layer.attribution, crossOrigin: layer.crossOrigin };
    const request = { ...params, SERVICE: 'WMS', REQUEST: 'GetMap' };
    if (!tiled) return { source: compact<WmsImageSource>({ type: 'wms-image', url, params, ...common }), key: canonicalUrl(url, request) };
    const key = canonicalUrl(url, { ...request, WIDTH: tileSize, HEIGHT: tileSize });
    return { source: compact<WmsTilesSource>({ type: 'wms-tiles', url, params, tileSize, ...common }), key };
};

const geoJsonSource = (layer: LayerDef, state: LayerStateSnapshot): { source: LayerSource; key: string } => {
    const common = { attribution: layer.attribution, crossOrigin: layer.crossOrigin };
    if (layer.data !== undefined && typeof layer.data !== 'string') {
        return { source: compact<GeoJsonSource>({ type: 'geojson', data: layer.data, ...common }), key: `data:${fnv1a(stableJson(layer.data))}` };
    }
    const wfs = layer.wfs;
    const url = typeof layer.data === 'string' || !wfs
        ? canonicalUrl(layer.data as string, {})
        : canonicalUrl(wfs.url, getFeatureParams({ typeName: wfs.typeName, cql: state.cql[layer.id] ?? null, srsName: 'EPSG:4326' }));
    return { source: compact<GeoJsonSource>({ type: 'geojson', url, ...common }), key: url };
};

const tileSource = (layer: LayerDef): { source: LayerSource; key: string } => {
    const tiles = layer.tiles as NonNullable<LayerDef['tiles']>;
    const type = layer.kind as 'vector-tiles' | 'pmtiles' | 'xyz';
    const source = compact<LayerSource>({
        type,
        url: tiles.url,
        sourceLayer: type === 'xyz' ? undefined : tiles.sourceLayer,
        attribution: layer.attribution,
        crossOrigin: layer.crossOrigin,
    });
    return { source, key: `${type}:${tiles.url}` };
};

const sourceOf = (layer: LayerDef, state: LayerStateSnapshot): { source: LayerSource; key: string } => {
    if (layer.kind === 'wms') return wmsSource(layer, state);
    if (layer.kind === 'geojson') return geoJsonSource(layer, state);
    return tileSource(layer);
};

export const describe = (catalog: Catalog, state: LayerStateSnapshot): LayerDescription[] => {
    const layers = state.active.map(id => catalog.get(id)).filter((layer): layer is LayerDef => layer !== undefined);
    return layers.map((layer, position) => compact<LayerDescription>({
        id: layer.id,
        kind: layer.kind,
        zIndex: DATA_Z_BASE + (layers.length - position) * DATA_Z_STEP,
        opacity: state.opacity[layer.id] ?? 1,
        visible: state.visible[layer.id] ?? true,
        minZoom: layer.minZoom,
        maxZoom: layer.maxZoom,
        ...sourceOf(layer, state),
    }));
};
