import { describe, expect, it } from 'vitest';
import { and, between, bbox, escapeLike, inList, not, or, quoteIdentifier, quoteLiteral } from '../src/cql/index.js';

describe('quoteIdentifier', () => {
    it('leaves simple names alone', () => {
        expect(quoteIdentifier('STATE_NAME')).toBe('STATE_NAME');
    });

    it('quotes names with spaces, accents or quotes', () => {
        expect(quoteIdentifier('año fiscal')).toBe('"año fiscal"');
        expect(quoteIdentifier('a"b')).toBe('"a""b"');
        expect(quoteIdentifier('1st')).toBe('"1st"');
    });

    it('quotes reserved words', () => {
        expect(quoteIdentifier('date')).toBe('date');
        expect(quoteIdentifier('in')).toBe('"in"');
        expect(quoteIdentifier('BBOX')).toBe('"BBOX"');
    });

    it('rejects an empty name', () => {
        expect(() => quoteIdentifier('')).toThrow(TypeError);
    });
});

describe('quoteLiteral', () => {
    it('quotes strings and doubles single quotes', () => {
        expect(quoteLiteral("O'Higgins")).toBe("'O''Higgins'");
    });

    it('writes numbers, booleans and dates', () => {
        expect(quoteLiteral(1.5)).toBe('1.5');
        expect(quoteLiteral(-0)).toBe('0');
        expect(quoteLiteral(true)).toBe('true');
        expect(quoteLiteral(new Date(Date.UTC(2024, 0, 2)))).toBe("'2024-01-02T00:00:00.000Z'");
    });

    it('rejects non finite numbers and invalid dates', () => {
        expect(() => quoteLiteral(Number.NaN)).toThrow(RangeError);
        expect(() => quoteLiteral(new Date('nope'))).toThrow(RangeError);
    });
});

describe('escapeLike', () => {
    it('escapes wildcards and the escape character', () => {
        expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
    });
});

describe('boolean helpers', () => {
    it('and drops empty parts and wraps the rest', () => {
        expect(and()).toBeNull();
        expect(and(null, ' ', undefined)).toBeNull();
        expect(and('a = 1', null)).toBe('a = 1');
        expect(and('a = 1', 'b = 2 OR c = 3')).toBe('(a = 1) AND (b = 2 OR c = 3)');
    });

    it('or works like and', () => {
        expect(or('a = 1', '', 'b = 2')).toBe('(a = 1) OR (b = 2)');
    });

    it('not wraps or returns null', () => {
        expect(not('a = 1')).toBe('NOT (a = 1)');
        expect(not(null)).toBeNull();
    });
});

describe('inList', () => {
    it('uses = for one value and IN for many, without duplicates', () => {
        expect(inList('code', [])).toBeNull();
        expect(inList('code', ['A'])).toBe("code = 'A'");
        expect(inList('code', ['A', 'B', 'A'])).toBe("code IN ('A', 'B')");
        expect(inList('mi campo', [1, 2])).toBe('"mi campo" IN (1, 2)');
    });
});

describe('between', () => {
    it('orders numeric bounds', () => {
        expect(between('pop', 10, 2)).toBe('pop BETWEEN 2 AND 10');
    });

    it('quotes string bounds', () => {
        expect(between('day', '2024-01-01', '2024-12-31')).toBe("day BETWEEN '2024-01-01' AND '2024-12-31'");
    });
});

describe('bbox', () => {
    it('rounds to six decimals and quotes the srs', () => {
        expect(bbox('the_geom', [-103.12345678, 20.5, -102.000000001, 21], 'EPSG:4326'))
            .toBe("BBOX(the_geom, -103.123457, 20.5, -102, 21, 'EPSG:4326')");
        expect(bbox('geom', [0, 0, 1, 1])).toBe('BBOX(geom, 0, 0, 1, 1)');
    });
});
