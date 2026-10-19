import type { IdentifyQuery } from '../identify/identify.js';
import type { Feature } from '../ogc/types.js';
import { PREFIX } from './specs.js';

export interface RenderedFeatureLike {
    id?: string | number | undefined;
    geometry: unknown;
    properties: Record<string, unknown> | null;
}

export interface MapLibreQueryable {
    project(lngLat: [number, number]): { x: number; y: number };
    queryRenderedFeatures(geometry: [[number, number], [number, number]], options: { layers: string[] }): RenderedFeatureLike[];
    getLayersOrder(): string[];
}

export const styleLayersOf = (map: Pick<MapLibreQueryable, 'getLayersOrder'>, layerId: string): string[] =>
    map.getLayersOrder().filter(id => id === `${PREFIX}${layerId}` || id.startsWith(`${PREFIX}${layerId}:`));

export const renderedQuery = (map: MapLibreQueryable): IdentifyQuery => (layerId, at, tolerance) => {
    const layers = styleLayersOf(map, layerId);
    if (layers.length === 0) return null;
    const { x, y } = map.project([at.coordinate[0], at.coordinate[1]]);
    const seen = new Set<string>();
    return map.queryRenderedFeatures([[x - tolerance, y - tolerance], [x + tolerance, y + tolerance]], { layers }).flatMap((feature): Feature[] => {
        const key = feature.id === undefined ? JSON.stringify(feature.properties) : String(feature.id);
        if (seen.has(key)) return [];
        seen.add(key);
        const copy: Feature = { type: 'Feature', geometry: feature.geometry, properties: feature.properties ? { ...feature.properties } : null };
        if (feature.id !== undefined) copy.id = feature.id;
        return [copy];
    });
};
