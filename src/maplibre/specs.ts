import type { DistributiveOmit, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { LayerDescription, LayerSource } from '../catalog/describe.js';
import { canonicalUrl } from '../ogc/canonical.js';

export type LayerTemplate = DistributiveOmit<LayerSpecification, 'id' | 'source'> & { id?: string };

export const PREFIX = 'urdimbre:';

const OPACITY: Record<string, readonly string[]> = {
    'raster': ['raster-opacity'],
    'line': ['line-opacity'],
    'fill': ['fill-opacity'],
    'circle': ['circle-opacity', 'circle-stroke-opacity'],
    'symbol': ['icon-opacity', 'text-opacity'],
    'fill-extrusion': ['fill-extrusion-opacity'],
    'heatmap': ['heatmap-opacity'],
};

export const isRaster = (source: LayerSource): boolean => source.type === 'wms-tiles' || source.type === 'wms-image' || source.type === 'xyz';

export const wmsTemplate = (source: Extract<LayerSource, { type: 'wms-tiles' | 'wms-image' }>): string => {
    const size = source.type === 'wms-tiles' ? source.tileSize : 256;
    const crs = source.params.VERSION === '1.1.1' ? 'SRS' : 'CRS';
    const url = canonicalUrl(source.url, { ...source.params, SERVICE: 'WMS', REQUEST: 'GetMap', WIDTH: size, HEIGHT: size, [crs]: 'EPSG:3857' });
    return `${url}&BBOX={bbox-epsg-3857}`;
};

const ABSOLUTE = /^[a-z][a-z\d+.-]*:/i;

export const resolveUrl = (url: string, baseUrl?: string): string => {
    if (baseUrl === undefined || ABSOLUTE.test(url)) return url;
    const tokens: string[] = [];
    const masked = url.replace(/\{[^{}]*\}/g, token => `__urdimbre${tokens.push(token) - 1}__`);
    return new URL(masked, baseUrl).href.replace(/__urdimbre(\d+)__/g, (_, index: string) => tokens[Number(index)] as string);
};

export const tileUrls = (source: LayerSource, baseUrl?: string): string[] | null => {
    if (source.type === 'wms-tiles' || source.type === 'wms-image') return [resolveUrl(wmsTemplate(source), baseUrl)];
    if (source.type === 'xyz') return [resolveUrl(source.url, baseUrl)];
    if (source.type === 'vector-tiles' && source.url.includes('{z}')) return [resolveUrl(source.url, baseUrl)];
    return null;
};

export const sourceData = (source: Extract<LayerSource, { type: 'geojson' }>, baseUrl?: string): unknown =>
    source.data ?? resolveUrl(source.url as string, baseUrl);

export const sourceSpec = (source: LayerSource, baseUrl?: string): SourceSpecification => {
    const attribution = source.attribution === undefined ? {} : { attribution: source.attribution };
    switch (source.type) {
        case 'wms-tiles':
        case 'wms-image':
        case 'xyz':
            return { type: 'raster', tiles: tileUrls(source, baseUrl) as string[], tileSize: source.type === 'wms-tiles' ? source.tileSize : 256, ...attribution };
        case 'vector-tiles': {
            const tiles = tileUrls(source, baseUrl);
            return tiles ? { type: 'vector', tiles, ...attribution } : { type: 'vector', url: resolveUrl(source.url, baseUrl), ...attribution };
        }
        case 'pmtiles':
            return { type: 'vector', url: source.url.startsWith('pmtiles://') ? source.url : `pmtiles://${resolveUrl(source.url, baseUrl)}`, ...attribution };
        case 'geojson':
            return { type: 'geojson', data: sourceData(source, baseUrl) as string, ...attribution };
    }
};

const scaled = (value: unknown, opacity: number): unknown => (typeof value === 'number' ? value * opacity : value === undefined ? opacity : value);

export const opacityPaint = (template: LayerTemplate, opacity: number): Record<string, unknown> => {
    const paint = (template.paint ?? {}) as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const name of OPACITY[template.type] ?? []) {
        const value = scaled(paint[name], opacity);
        if (typeof value === 'number') result[name] = value;
    }
    return result;
};

const GEOMETRY_TEMPLATES: Record<NonNullable<LayerDescription['geometryType']>, string> = { point: 'circle', line: 'line', polygon: 'fill' };

export const defaultTemplates = (description: LayerDescription): LayerTemplate[] => {
    if (isRaster(description.source)) return [{ type: 'raster' }] as LayerTemplate[];
    return [{ type: description.geometryType ? GEOMETRY_TEMPLATES[description.geometryType] : 'line' }] as LayerTemplate[];
};

export const layerSpecs = (description: LayerDescription, templates: readonly LayerTemplate[], sourceId: string): LayerSpecification[] => {
    const sourceLayer = 'sourceLayer' in description.source ? description.source.sourceLayer : undefined;
    return templates.map((template, index) => {
        const id = `${PREFIX}${description.id}${templates.length === 1 ? '' : `:${template.id ?? index}`}`;
        const spec: Record<string, unknown> = {
            ...template,
            id,
            source: sourceId,
            layout: { ...template.layout, visibility: description.visible ? 'visible' : 'none' },
            paint: { ...template.paint, ...opacityPaint(template, description.opacity) },
        };
        if (sourceLayer !== undefined && spec['source-layer'] === undefined && description.source.type !== 'geojson') spec['source-layer'] = sourceLayer;
        if (description.minZoom !== undefined) spec.minzoom = description.minZoom;
        if (description.maxZoom !== undefined) spec.maxzoom = description.maxZoom;
        return spec as unknown as LayerSpecification;
    });
};
