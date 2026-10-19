import { describe, expect, it } from 'vitest';
import { createLayerState, defineCatalog } from '../src/catalog/index.js';
import { applyLayerState, decodeState, encodeState, readLayerState } from '../src/state/index.js';
import type { PortalState } from '../src/state/index.js';
import { catalogInput } from './layers.js';

const catalog = defineCatalog(catalogInput());

const portal = (): PortalState => {
    const layers = createLayerState(catalog, { active: ['storms', 'states', 'osm'] });
    layers.setOpacity('storms', 0.9);
    layers.setOpacity('states', 0.7);
    layers.setVisible('osm', false);
    layers.setDimension('storms', 'time', '1990-07-22T06:00:00.000Z');
    layers.composer('states').set('table', 'STATE_NAME = \'Nuevo León\' AND "año" > 2000');
    layers.composer('states').set('legend', 'PERSONS BETWEEN 1 AND 5');
    return {
        view: { center: [-103.3475, 20.6767], zoom: 14.2, bearing: 0, pitch: 45 },
        ...readLayerState(layers),
        tool: 'measure',
        extra: { lang: 'es' },
    };
};

describe('encodeState', () => {
    it('writes a compact and readable query', () => {
        const query = encodeState(portal(), catalog);
        expect(query.startsWith('v=20.6767,-103.3475,14.2,0,45&l=storms:90~time=1990-07-22T06:00:00.000Z,states:70,osm!&f=')).toBe(true);
        expect(query).toMatch(/&f=states~legend:[A-Za-z0-9_-]+,states~table:[A-Za-z0-9_-]+&t=measure&lang=es$/);
        expect(query).not.toMatch(/[ '"]/);
    });

    it('keeps the coordinates as precise as the zoom needs', () => {
        const state = { ...portal(), view: { center: [-103.347512345, 20.676712345] as [number, number], zoom: 3.04, bearing: 12.6, pitch: 0.4 } };
        expect(encodeState(state, catalog)).toMatch(/^v=20\.68,-103\.35,3,13,0&/);
    });

    it('skips layers missing from the catalog and the reserved extra keys', () => {
        const state = portal();
        const query = encodeState({ ...state, layers: { ...state.layers, active: ['gone', 'osm'] }, fragments: {}, tool: null, extra: { v: 'x', l: 'y' } }, catalog);
        expect(query).toBe('v=20.6767,-103.3475,14.2,0,45&l=osm!');
    });
});

describe('decodeState', () => {
    it('round-trips exactly', () => {
        const state = portal();
        const decoded = decodeState(`?${encodeState(state, catalog)}`, catalog);
        expect(decoded.view).toEqual(state.view);
        expect(decoded.layers).toEqual({
            active: ['storms', 'states', 'osm'],
            opacity: { storms: 0.9, states: 0.7 },
            visible: { osm: false },
            dimensions: { storms: { time: '1990-07-22T06:00:00.000Z' } },
            cql: { states: state.layers.cql.states },
        });
        expect(decoded.fragments).toEqual(state.fragments);
        expect(decoded.tool).toBe('measure');
        expect(decoded.extra).toEqual({ lang: 'es' });
        expect(encodeState(decoded as PortalState, catalog)).toBe(encodeState(state, catalog));
    });

    it('keeps quotes, accents and separators inside the CQL', () => {
        const cql = 'NAME LIKE \'%Ñuñoa, 50% & más~\' OR "x:y" = \'a=b\'';
        const state = { ...portal(), fragments: { states: { table: cql } } };
        const decoded = decodeState(encodeState(state, catalog), catalog);
        expect(decoded.fragments).toEqual({ states: { table: cql } });
        expect(decoded.layers?.cql.states).toBe(cql);
    });

    it('turns a plain CQL without fragments into the base fragment', () => {
        const { fragments, ...state } = portal();
        expect(fragments).toBeDefined();
        const query = encodeState({ ...state, layers: { ...state.layers, cql: { storms: 'wind > 10' } } }, catalog);
        expect(decodeState(query, catalog).fragments).toEqual({ storms: { base: 'wind > 10' } });
    });

    it('ignores ids that are not in the catalog', () => {
        const decoded = decodeState('v=0,0,2&l=old:50,osm,old2~time=x&f=old~table:YQ', catalog);
        expect(decoded.layers?.active).toEqual(['osm']);
        expect(decoded.fragments).toEqual({});
    });

    it('tolerates garbage', () => {
        const garbage = ['', '?', '&&&', 'v=abc&l=%E0%A4%A&f=@@@', 'v=95,0,2', 'v=1,2', 'l=states:999,states:abc,osm:40:2,:30,states~=x~time=', 'f=states~a:!!!,states~b:_w'];
        for (const query of garbage) expect(() => decodeState(query, catalog)).not.toThrow();
        expect(decodeState('v=95,0,2', catalog).view).toBeUndefined();
        expect(decodeState('v=abc&l=%E0%A4%A', catalog).layers?.active).toEqual([]);
        expect(decodeState('l=states:999,osm:40:2,elevation:abc', catalog).layers).toMatchObject({ active: ['states'], opacity: {} });
        expect(decodeState('l=states,storms~=x~time=', catalog).layers?.dimensions).toEqual({});
        expect(decodeState('l=states&f=states~a:_w', catalog).fragments).toEqual({});
    });

    it('reads a full URL, defaults the bearing and pitch and leaves layers out when l is missing', () => {
        const decoded = decodeState('https://example.org/map?v=20.5,-103.25,10#top', catalog);
        expect(decoded.view).toEqual({ center: [-103.25, 20.5], zoom: 10, bearing: 0, pitch: 0 });
        expect(decoded.layers).toBeUndefined();
        expect(decoded.tool).toBeNull();
    });
});

describe('applyLayerState', () => {
    it('brings a layer state to the decoded one, fragments included', () => {
        const target = createLayerState(catalog, { active: ['osm', 'roads'] });
        target.composer('roads').set('old', 'a = 1');
        target.setOpacity('roads', 0.2);
        const state = portal();
        applyLayerState(target, decodeState(encodeState(state, catalog), catalog));
        const snapshot = target.getSnapshot();
        expect(snapshot.active).toEqual(['storms', 'states', 'osm']);
        expect(snapshot.opacity).toEqual({ storms: 0.9, states: 0.7 });
        expect(snapshot.visible).toEqual({ osm: false });
        expect(snapshot.cql).toEqual({ states: state.layers.cql.states });
        expect(target.composer('states').getSnapshot().fragments).toEqual(state.fragments?.states);
    });
});
