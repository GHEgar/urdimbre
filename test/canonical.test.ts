import { describe, expect, it } from 'vitest';
import { canonicalUrl } from '../src/ogc/index.js';

describe('canonicalUrl', () => {
    it('uppercases and sorts the keys', () => {
        const url = canonicalUrl('https://example.org/wms', { version: '1.3.0', request: 'GetMap', Service: 'WMS' });
        expect(url).toBe('https://example.org/wms?REQUEST=GetMap&SERVICE=WMS&VERSION=1.3.0');
    });

    it('does not depend on the order or the case of the input', () => {
        const a = canonicalUrl('https://example.org/wms', { layers: 'a:b', SERVICE: 'WMS', width: 256 });
        const b = canonicalUrl('https://example.org/wms', { WIDTH: 256, service: 'WMS', LaYeRs: 'a:b' });
        expect(a).toBe(b);
    });

    it('drops empty, null and undefined values and empty lists', () => {
        const url = canonicalUrl('https://example.org/wms', { A: '', B: null, C: undefined, D: [], E: '  ', F: 'x' });
        expect(url).toBe('https://example.org/wms?F=x');
    });

    it('rounds the bbox to six decimals without trailing zeros', () => {
        const url = canonicalUrl('https://example.org/wms', { bbox: [-103.123456789, 20.50, -102.0000001, 21.000000], crs: 'EPSG:4326' });
        expect(url).toBe('https://example.org/wms?BBOX=-103.123457,20.5,-102,21&CRS=EPSG:4326');
    });

    it('writes booleans, numbers and dates canonically', () => {
        const url = canonicalUrl('https://example.org/wms', { transparent: true, tiled: false, width: 256.0, z: -0, at: new Date(Date.UTC(2020, 0, 1)) });
        expect(url).toBe('https://example.org/wms?AT=2020-01-01T00:00:00.000Z&TILED=false&TRANSPARENT=true&WIDTH=256&Z=0');
    });

    it('joins lists with commas', () => {
        expect(canonicalUrl('https://example.org/wms', { layers: ['a', 'b'] })).toBe('https://example.org/wms?LAYERS=a,b');
    });

    it('merges the query already in the base and lets params win', () => {
        const url = canonicalUrl('https://example.org/ows?service=WFS&map=x#frag', { SERVICE: 'WMS' });
        expect(url).toBe('https://example.org/ows?MAP=x&SERVICE=WMS');
        expect(canonicalUrl('https://example.org/ows?', {})).toBe('https://example.org/ows');
    });

    it('encodes values but keeps commas, colons and slashes readable', () => {
        const url = canonicalUrl('https://example.org/wms', { cql_filter: "name = 'a&b' AND x > 1", time: '2020-01-01/2020-02-01' });
        expect(url).toBe("https://example.org/wms?CQL_FILTER=name%20%3D%20'a%26b'%20AND%20x%20%3E%201&TIME=2020-01-01/2020-02-01");
        expect(new URL(url).searchParams.get('CQL_FILTER')).toBe("name = 'a&b' AND x > 1");
    });

    it('rejects non finite numbers', () => {
        expect(() => canonicalUrl('https://example.org/wms', { width: Number.NaN })).toThrow(RangeError);
    });
});
