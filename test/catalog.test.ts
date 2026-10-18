import { describe, expect, it } from 'vitest';
import { CatalogError, defineCatalog, enrichFromCapabilities } from '../src/catalog/index.js';
import { createOgcClient } from '../src/ogc/index.js';
import { fixture, mockFetch, text } from './helpers.js';
import { catalogInput, GS } from './layers.js';

const errorOf = (input: unknown): CatalogError => {
    try {
        defineCatalog(input);
    } catch (error) {
        if (error instanceof CatalogError) return error;
        throw error;
    }
    throw new Error('defineCatalog did not throw');
};

const reverseKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reverseKeys);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseKeys(item)]));
};

describe('defineCatalog', () => {
    it('accepts a valid catalog and finds layers by id', () => {
        const catalog = defineCatalog(catalogInput());
        expect(catalog.layers).toHaveLength(8);
        expect(catalog.get('states')?.wms?.layers).toBe('topp:states');
        expect(catalog.get('missing')).toBeUndefined();
        expect(defineCatalog(catalogInput().layers).hash).toBe(catalog.hash);
    });

    it('freezes the layers and copies inline data', () => {
        const input = catalogInput();
        const catalog = defineCatalog(input);
        expect(Object.isFrozen(catalog.layers)).toBe(true);
        expect(Object.isFrozen(catalog.get('states')?.wms)).toBe(true);
        expect(Object.isFrozen(input.layers[6]?.data)).toBe(false);
    });

    it('keeps the hash stable when keys change order', () => {
        const catalog = defineCatalog(catalogInput());
        const shuffled = defineCatalog(reverseKeys(catalogInput()));
        expect(shuffled.hash).toBe(catalog.hash);
        expect(catalog.hash).toMatch(/^[0-9a-f]{8}$/);
    });

    it('changes the hash when the content or the layer order changes', () => {
        const base = defineCatalog(catalogInput()).hash;
        const changed = catalogInput();
        (changed.layers[0] as { title: string }).title = 'Estados';
        expect(defineCatalog(changed).hash).not.toBe(base);
        expect(defineCatalog({ layers: [...catalogInput().layers].reverse() }).hash).not.toBe(base);
    });

    it('reports errors with the path of the field', () => {
        expect(errorOf({ layers: [{ id: 'a', kind: 'wms' }] }).path).toBe('layers[0].wms');
        expect(errorOf({ layers: [{ id: 'a', kind: 'wms', wms: { url: GS } }] }).path).toBe('layers[0].wms.layers');
        expect(errorOf({ layers: [{ id: 'a', kind: 'raster' }] }).path).toBe('layers[0].kind');
        expect(errorOf({ layers: [{ kind: 'xyz', tiles: { url: 'x/{z}' } }] }).path).toBe('layers[0].id');
        expect(errorOf({ layers: [{ id: 'a', kind: 'xyz', tiles: { url: 'https://x' } }] }).path).toBe('layers[0].tiles.url');
        expect(errorOf({ layers: [{ id: 'a', kind: 'wms', wms: { url: GS, layers: 'x', tileSize: 300 } }] }).path).toBe('layers[0].wms.tileSize');
        expect(errorOf({ layers: [{ id: 'a', kind: 'geojson', data: {}, capabilities: ['time', 'fly'] }] }).path).toBe('layers[0].capabilities[1]');
        expect(errorOf({ layers: [{ id: 'a', kind: 'geojson', data: {}, colour: 'red' }] }).path).toBe('layers[0].colour');
        expect(errorOf('nope').path).toBe('catalog');
        expect(errorOf({ layers: {} }).path).toBe('layers');
    });

    it('checks that the kind fits its services', () => {
        expect(errorOf({ layers: [{ id: 'a', kind: 'xyz', tiles: { url: 'x/{z}' }, wms: { url: GS, layers: 'x' } }] }).path).toBe('layers[0].wms');
        expect(errorOf({ layers: [{ id: 'a', kind: 'geojson' }] }).path).toBe('layers[0].data');
        expect(errorOf({ layers: [{ id: 'a', kind: 'pmtiles', tiles: { url: 'p.pmtiles' }, data: {} }] }).path).toBe('layers[0].data');
        expect(errorOf({ layers: [{ id: 'a', kind: 'geojson', data: {}, minZoom: 10, maxZoom: 4 }] }).path).toBe('layers[0].minZoom');
        expect(errorOf({ layers: [{ id: 'a', kind: 'geojson', data: {}, bbox: [10, 0, 0, 10] }] }).path).toBe('layers[0].bbox');
    });

    it('rejects repeated ids and repeated dimension names', () => {
        const repeated = errorOf({ layers: [{ id: 'a', kind: 'geojson', data: {} }, { id: 'a', kind: 'geojson', data: {} }] });
        expect(repeated.path).toBe('layers[1].id');
        expect(repeated.message).toMatch(/repeats the id a/);
        expect(errorOf({ layers: [{ id: 'a', kind: 'geojson', data: {}, dimensions: { time: {}, TIME: {} } }] }).path).toBe('layers[0].dimensions.TIME');
    });
});

describe('enrichFromCapabilities', () => {
    it('fills title, abstract, bbox, dimensions and legend without overwriting what is declared', async () => {
        const { fetch, calls } = mockFetch(() => text(fixture('geoserver-capabilities.xml')));
        const client = createOgcClient({ fetch });
        const catalog = defineCatalog(catalogInput());
        const enriched = await enrichFromCapabilities(catalog, client);
        expect(calls).toHaveLength(1);
        expect(enriched.get('states')?.title).toBe('States');
        expect(enriched.get('states')?.legendUrl).toMatch(/layer=topp%3Astates$/);
        expect(enriched.get('states')?.bbox?.[0]).toBeLessThan(-100);
        const storms = enriched.get('storms');
        expect(storms?.title).toBeTruthy();
        expect(storms?.dimensions?.time?.default).toBe('1990-07-22T06:00:00.000Z');
        expect(storms?.dimensions?.time?.values).toMatch(/^1990-07-22T06/);
        expect(enriched.get('elevation')?.dimensions?.elevation?.default).toBe('100.0');
        expect(enriched.get('osm')).toEqual(catalog.get('osm'));
        expect(enriched.hash).not.toBe(catalog.hash);
    });

    it('rejects when a service fails', async () => {
        const { fetch } = mockFetch(() => text('nope', 500, 'text/plain'));
        await expect(enrichFromCapabilities(defineCatalog(catalogInput()), createOgcClient({ fetch }))).rejects.toThrow();
    });
});
