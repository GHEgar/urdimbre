import type { Map as MaplibreMap } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { renderedQuery, styleLayersOf } from '../src/maplibre/index.js';
import type { MapLibreQueryable, RenderedFeatureLike } from '../src/maplibre/index.js';

export const fitsRealMap = (map: MaplibreMap): MapLibreQueryable => map;

const at = { coordinate: [-103.35, 20.67] as [number, number], pixel: [0, 0] as [number, number], resolution: 1, size: [1, 1] as [number, number], bbox: [0, 0, 1, 1] as [number, number, number, number] };

const fake = (features: RenderedFeatureLike[]) => {
    const asked: unknown[] = [];
    const map: MapLibreQueryable = {
        project: ([lon, lat]) => ({ x: lon + 200, y: lat + 100 }),
        queryRenderedFeatures: (geometry, options) => {
            asked.push([geometry, options.layers]);
            return features;
        },
        getLayersOrder: () => ['background', 'urdimbre:roads:casing', 'urdimbre:roads:line', 'urdimbre:roadside', 'urdimbre:points'],
    };
    return { map, asked };
};

describe('renderedQuery', () => {
    it('finds the style layers of a logical layer', () => {
        expect(styleLayersOf(fake([]).map, 'roads')).toEqual(['urdimbre:roads:casing', 'urdimbre:roads:line']);
        expect(styleLayersOf(fake([]).map, 'points')).toEqual(['urdimbre:points']);
    });

    it('queries a box of the tolerance around the projected point and drops tile duplicates', () => {
        const { map, asked } = fake([
            { id: 1, geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'a' } },
            { id: 1, geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'a' } },
            { geometry: null, properties: { name: 'b' } },
            { geometry: null, properties: { name: 'b' } },
            { geometry: null, properties: null },
        ]);
        const query = renderedQuery(map);
        expect(query('roads', at, 4)).toEqual([
            { type: 'Feature', id: 1, geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'a' } },
            { type: 'Feature', geometry: null, properties: { name: 'b' } },
            { type: 'Feature', geometry: null, properties: null },
        ]);
        expect(asked).toEqual([[[[96.65 - 4, 120.67 - 4], [96.65 + 4, 120.67 + 4]], ['urdimbre:roads:casing', 'urdimbre:roads:line']]]);
    });

    it('gives null for a layer that is not in the style', () => {
        const { map, asked } = fake([]);
        expect(renderedQuery(map)('missing', at, 5)).toBeNull();
        expect(asked).toEqual([]);
    });
});
