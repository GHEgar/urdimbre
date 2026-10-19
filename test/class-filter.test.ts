import { describe, expect, it } from 'vitest';
import { EXCLUDE } from '../src/cql/index.js';
import { classesFromCql, classFilterCql, legendFromClasses } from '../src/legend/index.js';

const breaks = { breaks: [0, 10, 100, 1000] };

describe('classFilterCql', () => {
    it('gives null for all classes, EXCLUDE for none and one range per visible class', () => {
        expect(classFilterCql('pop', breaks, [0, 1, 2])).toBeNull();
        expect(classFilterCql('pop', breaks, [])).toBe(EXCLUDE);
        expect(classFilterCql('pop', breaks, [1])).toBe('pop >= 10 AND pop < 100');
        expect(classFilterCql('pop', breaks, new Set([2, 0]))).toBe('(pop >= 0 AND pop < 10) OR (pop >= 100 AND pop <= 1000)');
        expect(classFilterCql('pop', breaks, [2], { lastInclusive: false })).toBe('pop >= 100 AND pop < 1000');
    });

    it('quotes the field, ignores unknown indexes and takes legend classes', () => {
        const legend = legendFromClasses('hex', 'Hex', breaks, undefined, { colors: ['#111', '#222', '#333'] });
        const classes = legend.kind === 'classes' ? legend.classes : [];
        expect(classFilterCql('año', classes, [0, 7, -1])).toBe('"año" >= 0 AND "año" < 10');
        expect(classFilterCql('pop', [], [])).toBeNull();
    });

    it('leaves open ends open', () => {
        const classes = [{ max: 10 }, { min: 10, max: 20 }, { min: 20 }];
        expect(classFilterCql('v', classes, [0, 2])).toBe('(v < 10) OR (v >= 20)');
        expect(classFilterCql('v', [{}, { min: 1 }], [0])).toBeNull();
    });
});

describe('classesFromCql', () => {
    it('reads back every selection it writes', () => {
        for (let mask = 0; mask < 8; mask += 1) {
            const visible = [0, 1, 2].filter(index => mask & (1 << index));
            const fragment = classFilterCql('pop', breaks, visible);
            expect([...(classesFromCql(fragment, 'pop', breaks) ?? [])]).toEqual(visible);
        }
    });

    it('treats an empty fragment as all classes and refuses foreign fragments', () => {
        expect([...(classesFromCql(null, 'pop', breaks) ?? [])]).toEqual([0, 1, 2]);
        expect([...(classesFromCql('  ', 'pop', breaks) ?? [])]).toEqual([0, 1, 2]);
        expect(classesFromCql(` ${EXCLUDE} `, 'pop', breaks)?.size).toBe(0);
        expect(classesFromCql('pop > 3', 'pop', breaks)).toBeNull();
        expect(classesFromCql('(pop >= 100 AND pop <= 1000) OR (pop >= 0 AND pop < 10)', 'pop', breaks)).toBeNull();
        expect(classesFromCql('pop >= 10 AND pop < 100', 'other', breaks)).toBeNull();
        expect(classesFromCql('(pop >= 0 AND pop < 10) OR (pop >= 10 AND pop < 100) OR x', 'pop', breaks)).toBeNull();
    });
});
