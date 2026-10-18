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

export const tileUrls = (source: LayerSource): string[] | null => {
    if (source.type === 'wms-tiles' || source.type === 'wms-image') return [wmsTemplate(source)];
    if (source.type === 'xyz') return [source.url];
    return null;
};

export const sourceSpec = (source: LayerSource): SourceSpecification => {
    const attribution = source.attribution === undefined ? {} : { attribution: source.attribution };
    switch (source.type) {
        case 'wms-tiles':
        case 'wms-image':
        case 'xyz':
            return { type: 'raster', tiles: tileUrls(source) as string[], tileSize: source.type === 'wms-tiles' ? source.tileSize : 256, ...attribution };
        case 'vector-tiles':
            return source.url.includes('{z}') ? { type: 'vector', tiles: [source.url], ...attribution } : { type: 'vector', url: source.url, ...attribution };
        case 'pmtiles':
            return { type: 'vector', url: source.url.startsWith('pmtiles://') ? source.url : `pmtiles://${source.url}`, ...attribution };
        case 'geojson':
            return { type: 'geojson', data: (source.data ?? source.url) as string, ...attribution };
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

export const defaultTemplates = (description: LayerDescription): LayerTemplate[] =>
    (isRaster(description.source) ? [{ type: 'raster' }] : [{ type: 'line' }]) as LayerTemplate[];

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
