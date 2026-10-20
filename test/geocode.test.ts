import { describe, expect, it, vi } from 'vitest';
import { createPhotonClient, createPlaceIndex, normalizeName, placeFromPhoton, type Place } from '../src/geocode/index.js';

const place = (name: string, kind: string, coordinate: [number, number] = [0, 0]): Place => ({ name, kind, coordinate });

describe('normalizeName', () => {
    it('drops accents, case and punctuation', () => {
        expect(normalizeName('  Glorieta  La Minerva, Gdl. ')).toBe('glorieta la minerva gdl');
        expect(normalizeName('Gonzálo González Niño')).toBe('gonzalo gonzalez nino');
    });
});

describe('createPlaceIndex', () => {
    const index = createPlaceIndex([
        place('Avenida Chapultepec', 'street', [-103.37, 20.67]),
        place('Chapultepec', 'neighbourhood', [-103.37, 20.67]),
        place('Chapalita', 'neighbourhood', [-103.4, 20.66]),
        place('Bosque de Chapultepec', 'park', [-99.18, 19.42]),
        place('Zapopan', 'locality', [-103.39, 20.72]),
    ], { kindRank: { locality: 0, neighbourhood: 1, street: 2, park: 3 } });

    it('ranks exact, then prefix, then word prefix, then substring', () => {
        expect(index.search('chapultepec').map(item => item.name)).toEqual(['Chapultepec', 'Avenida Chapultepec', 'Bosque de Chapultepec']);
    });

    it('matches every term as a word prefix and ignores accents', () => {
        expect(index.search('av chapúl').map(item => item.name)).toEqual(['Avenida Chapultepec']);
    });

    it('keeps prefix and word prefix matches in one tier ordered by kind and distance', () => {
        const calles = createPlaceIndex([place('Chapultepec 927', 'street', [-103.1, 20.5]), place('Avenida Chapultepec', 'street', [-103.37, 20.67])]);
        expect(calles.search('chapul', { near: [-103.36, 20.67] }).map(item => item.name)).toEqual(['Avenida Chapultepec', 'Chapultepec 927']);
    });

    it('puts nearby bands first when bands are given', () => {
        const lejos = Array.from({ length: 20 }, (_, i) => place('Chapultepec', 'neighbourhood', [-99 + i * 0.01, 19.4]));
        const indice = createPlaceIndex([...lejos, place('Chapultepec Country', 'neighbourhood', [-103.37, 20.69])]);
        expect(indice.search('chapultepec', { near: [-103.35, 20.67], limit: 3, bands: [0.25, 2.5] })[0]?.name).toBe('Chapultepec Country');
        expect(indice.search('chapultepec', { near: [-103.35, 20.67], limit: 3 })[0]?.name).toBe('Chapultepec');
    });

    it('breaks ties by kind and then by distance', () => {
        const cercano = createPlaceIndex([place('Centro', 'park', [-99, 19]), place('Centro', 'park', [-103.3, 20.6])]);
        expect(cercano.search('centro', { near: [-103.35, 20.67] })[0]?.coordinate).toEqual([-103.3, 20.6]);
    });

    it('respects the limit and returns nothing for an empty query', () => {
        expect(index.search('cha', { limit: 2 })).toHaveLength(2);
        expect(index.search('  ')).toEqual([]);
        expect(index.size).toBe(5);
    });
});

describe('createPhotonClient', () => {
    const respuesta = {
        features: [
            { geometry: { coordinates: [-103.39, 20.67] }, properties: { name: 'La Minerva', osm_value: 'roundabout', city: 'Guadalajara', state: 'Jalisco' } },
            { geometry: { coordinates: [-103.35, 20.68] }, properties: { street: 'Avenida Juárez', housenumber: '976', city: 'Guadalajara', extent: [-103.36, 20.69, -103.34, 20.67] } },
            { properties: { name: 'sin geometría' } },
        ],
    };

    it('builds a canonical url', () => {
        const client = createPhotonClient({ url: '/photon/api', lang: 'default' });
        expect(client.searchUrl('  la   minerva ', { near: [-103.391234, 20.6743], limit: 5 })).toBe('/photon/api?lang=default&lat=20.6743&limit=5&lon=-103.3912&q=la+minerva');
    });

    it('turns near and radius into a bounding box', () => {
        expect(createPhotonClient().searchUrl('x', { near: [-103, 20], radius: 1.5 })).toBe('https://photon.komoot.io/api/?bbox=-104.5%2C18.5%2C-101.5%2C21.5&lat=20&limit=6&lon=-103&q=x');
    });

    it('maps features and caches repeated searches', async () => {
        const fetcher = vi.fn(async () => new Response(JSON.stringify(respuesta)));
        const client = createPhotonClient({ fetch: fetcher as unknown as typeof fetch });
        const places = await client.search('minerva');
        await client.search('minerva');
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(places).toEqual([
            { name: 'La Minerva', kind: 'roundabout', coordinate: [-103.39, 20.67], detail: 'Guadalajara · Jalisco', source: 'photon' },
            { name: 'Avenida Juárez 976', kind: 'place', coordinate: [-103.35, 20.68], detail: 'Guadalajara', bbox: [-103.36, 20.67, -103.34, 20.69], source: 'photon' },
        ]);
    });

    it('passes the abort signal and reports http errors', async () => {
        const controller = new AbortController();
        const fetcher = vi.fn(async () => new Response('no', { status: 503 }));
        const client = createPhotonClient({ fetch: fetcher as unknown as typeof fetch });
        await expect(client.search('x', { signal: controller.signal })).rejects.toThrow('Photon responded 503');
        expect(fetcher).toHaveBeenCalledWith(expect.any(String), { signal: controller.signal });
    });

    it('skips empty queries without fetching', async () => {
        const fetcher = vi.fn();
        await expect(createPhotonClient({ fetch: fetcher as unknown as typeof fetch }).search(' , ')).resolves.toEqual([]);
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('ignores features without a name', () => {
        expect(placeFromPhoton({ geometry: { coordinates: [0, 0] }, properties: {} })).toBeNull();
    });
});
