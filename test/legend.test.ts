import { describe, expect, it } from 'vitest';
import { createLayerState, defineCatalog, describe as describeLayers } from '../src/catalog/index.js';
import type { LayerDef, LayerDescription } from '../src/catalog/index.js';
import { legendForState, legendFromClasses, legendFromMapLibreStyle, legendFromWms } from '../src/legend/index.js';
import { GS, catalogInput } from './layers.js';
import { query } from './helpers.js';

const input = catalogInput();
input.layers.push({ id: 'user', title: 'My layer', kind: 'xyz', tiles: { url: 'https://tile.example.org/u/{z}/{x}/{y}.png' }, legendUrl: 'https://example.org/legend.png' } as never);
const catalog = defineCatalog(input);

const descriptions = () => {
    const layers = createLayerState(catalog, { active: ['storms', 'states', 'osm', 'user', 'elevation'] });
    layers.setDimension('storms', 'time', '1990-07-22T06:00:00Z');
    layers.composer('states').set('table', 'PERSONS > 1000000');
    layers.setVisible('elevation', false);
    return describeLayers(catalog, layers.getSnapshot());
};

const pick = (id: string): [LayerDescription, LayerDef] => {
    const description = descriptions().find(item => item.id === id);
    const def = catalog.get(id);
    if (!description || !def) throw new Error(`Missing ${id}`);
    return [description, def];
};

describe('legendFromWms', () => {
    it('builds a canonical GetLegendGraphic with the TIME and CQL of the layer', () => {
        const timed = legendFromWms(...pick('storms'), { width: 20, height: 20 });
        expect(timed).toMatchObject({ kind: 'image', layerId: 'storms', title: 'storms' });
        expect(query(timed.kind === 'image' ? timed.url : '')).toEqual({
            FORMAT: 'image/png', HEIGHT: '20', LAYER: 'geosolutions:storm_obs_test', REQUEST: 'GetLegendGraphic',
            SERVICE: 'WMS', TIME: '1990-07-22T06:00:00Z', VERSION: '1.0.0', WIDTH: '20',
        });
        const filtered = legendFromWms(...pick('states'), { params: { legend_options: 'fontAntiAliasing:true' } });
        const url = filtered.kind === 'image' ? filtered.url : '';
        expect(url).toBe(`${GS}?CQL_FILTER=PERSONS%20%3E%201000000&FORMAT=image/png&LAYER=topp:states&LEGEND_OPTIONS=fontAntiAliasing:true&REQUEST=GetLegendGraphic&SERVICE=WMS&STYLE=polygon&VERSION=1.0.0`);
        expect(legendFromWms(...pick('states'), { params: { legend_options: 'fontAntiAliasing:true' } })).toEqual(filtered);
    });

    it('falls back to legendUrl and fails without one', () => {
        expect(legendFromWms(...pick('user'))).toEqual({ kind: 'image', layerId: 'user', title: 'My layer', url: 'https://example.org/legend.png' });
        expect(() => legendFromWms(...pick('osm'))).toThrow(RangeError);
    });
});

describe('legendForState', () => {
    it('lists the visible layers from the top, with custom entries first', () => {
        const entries = legendForState(catalog, descriptions());
        expect(entries.map(entry => entry.layerId)).toEqual(['storms', 'states', 'user']);
        const custom = legendForState(catalog, descriptions(), {
            hidden: true,
            custom: description => (description.id === 'osm' ? { kind: 'symbols', layerId: 'osm', title: 'OSM', items: [] } : null),
        });
        expect(custom.map(entry => `${entry.layerId}:${entry.kind}`)).toEqual(['storms:image', 'states:image', 'osm:symbols', 'user:image', 'elevation:image']);
    });
});

describe('legendFromClasses', () => {
    const panal = [
        { classIndex: 0, min: 0, max: 10.5, count: 4, closed: 'left' as const },
        { classIndex: 1, min: 10.5, max: 20, count: 0, closed: 'both' as const },
    ];

    it('takes the legend of panal/classify with colors and the counts of the histogram', () => {
        expect(legendFromClasses('hex', 'Hexbin', panal, [7, 3], { colors: ['#fee', '#c00'] })).toEqual({
            kind: 'classes', layerId: 'hex', title: 'Hexbin', classes: [
                { label: '0 – 10.5', color: '#fee', min: 0, max: 10.5, count: 7 },
                { label: '10.5 – 20', color: '#c00', min: 10.5, max: 20, count: 3 },
            ],
        });
    });

    it('takes a classification with breaks, own labels and a format', () => {
        const entry = legendFromClasses('hex', 'Hexbin', { breaks: [0, 1000, 2500] }, undefined, { colors: ['#eee', '#333'], format: value => value.toLocaleString('en') });
        expect(entry.kind === 'classes' ? entry.classes.map(item => item.label) : []).toEqual(['0 – 1,000', '1,000 – 2,500']);
        const labelled = legendFromClasses('hex', 'Hexbin', [{ min: 0, max: 1, color: 'red', label: 'Low' }]);
        expect(labelled.kind === 'classes' ? labelled.classes[0] : null).toEqual({ label: 'Low', color: 'red', min: 0, max: 1 });
        expect(() => legendFromClasses('hex', 'Hexbin', panal)).toThrow(/Class 0 of hex has no color/);
    });
});

describe('legendFromMapLibreStyle', () => {
    it('reads a step expression as classes', () => {
        const layers = [{ id: 'a', type: 'fill', paint: { 'fill-color': ['step', ['get', 'pop'], '#eee', 100, '#999', 1000, '#000'] } }];
        expect(legendFromMapLibreStyle('pop', 'Population', layers)).toEqual({
            kind: 'classes', layerId: 'pop', title: 'Population', classes: [
                { label: '< 100', color: '#eee', max: 100 },
                { label: '100 – 1000', color: '#999', min: 100, max: 1000 },
                { label: '≥ 1000', color: '#000', min: 1000 },
            ],
        });
    });

    it('reads interpolate as a ramp and skips zoom expressions', () => {
        const layers = [
            { id: 'z', type: 'line', paint: { 'line-color': ['interpolate', ['linear'], ['zoom'], 5, '#000', 10, '#fff'] } },
            { id: 'a', type: 'circle', paint: { 'circle-color': ['interpolate-hcl', ['linear'], ['get', 'v'], 0, 'blue', 50, 'red'] } },
        ];
        expect(legendFromMapLibreStyle('v', 'Value', layers)).toEqual({ kind: 'ramp', layerId: 'v', title: 'Value', stops: [{ value: 0, color: 'blue' }, { value: 50, color: 'red' }] });
    });

    it('reads match as symbols and simple colors per layer', () => {
        const match = [{ id: 'a', type: 'fill', paint: { 'fill-color': ['match', ['get', 'use'], 'park', 'green', ['home', 'flat'], 'orange', 'gray'] } }];
        expect(legendFromMapLibreStyle('use', 'Use', match)).toMatchObject({ kind: 'symbols', items: [{ label: 'park', color: 'green', shape: 'fill' }, { label: 'home, flat', color: 'orange', shape: 'fill' }] });
        const simple = [
            { id: 'roads', type: 'line', paint: { 'line-color': '#f80' } },
            { id: 'stops', type: 'circle', paint: { 'circle-color': '#08f' }, metadata: { 'urdimbre:label': 'Bus stops' } },
            { id: 'raster', type: 'raster' },
            { id: 'data', type: 'fill', paint: { 'fill-color': ['get', 'color'] } },
            'junk',
        ];
        expect(legendFromMapLibreStyle('net', 'Network', simple)).toEqual({ kind: 'symbols', layerId: 'net', title: 'Network', items: [
            { label: 'roads', color: '#f80', shape: 'line' },
            { label: 'Bus stops', color: '#08f', shape: 'point' },
        ] });
        expect(legendFromMapLibreStyle('one', 'One', [simple[0]])).toMatchObject({ items: [{ label: 'One' }] });
    });
});
