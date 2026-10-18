import { describe, expect, it, vi } from 'vitest';
import { createCqlComposer } from '../src/cql/index.js';

describe('createCqlComposer', () => {
    it('starts empty', () => {
        const composer = createCqlComposer();
        expect(composer.compose()).toBeNull();
        expect(composer.names()).toEqual([]);
        expect(composer.getSnapshot()).toEqual({ fragments: {}, cql: null });
    });

    it('joins in the given order and then alphabetically', () => {
        const composer = createCqlComposer({ order: ['base', 'table', 'bbox'] });
        composer.set('zeta', 'z = 1');
        composer.set('bbox', 'BBOX(geom, 0, 0, 1, 1)');
        composer.set('alpha', 'a = 1');
        composer.set('base', 'kind = 2');
        expect(composer.names()).toEqual(['base', 'bbox', 'alpha', 'zeta']);
        expect(composer.compose()).toBe('(kind = 2) AND (BBOX(geom, 0, 0, 1, 1)) AND (a = 1) AND (z = 1)');
    });

    it('gives the same string for the same state whatever the order of calls', () => {
        const first = createCqlComposer({ order: ['base'] });
        const second = createCqlComposer({ order: ['base'] });
        first.set('user', 'u = 1');
        first.set('base', 'b = 1');
        second.set('base', 'b = 1');
        second.set('user', 'u = 1');
        expect(first.compose()).toBe(second.compose());
    });

    it('removes a fragment with null, undefined or blank', () => {
        const composer = createCqlComposer();
        composer.set('a', 'a = 1');
        composer.set('b', 'b = 1');
        composer.set('a', null);
        expect(composer.compose()).toBe('b = 1');
        composer.set('b', '  ');
        expect(composer.compose()).toBeNull();
        expect(composer.get('b')).toBeNull();
    });

    it('keeps the snapshot while nothing changes', () => {
        const composer = createCqlComposer();
        composer.set('a', 'a = 1');
        const snapshot = composer.getSnapshot();
        composer.set('a', 'a = 1');
        composer.set('missing', null);
        expect(composer.getSnapshot()).toBe(snapshot);
        composer.set('a', 'a = 2');
        expect(composer.getSnapshot()).not.toBe(snapshot);
        expect(composer.getSnapshot()).toEqual({ fragments: { a: 'a = 2' }, cql: 'a = 2' });
    });

    it('notifies once per change and stops after unsubscribe', () => {
        const composer = createCqlComposer();
        const listener = vi.fn();
        const unsubscribe = composer.subscribe(listener);
        composer.set('a', 'a = 1');
        composer.set('a', 'a = 1');
        composer.set('a', ' a = 1 ');
        composer.set('b', null);
        expect(listener).toHaveBeenCalledTimes(1);
        composer.set('a', null);
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
        composer.set('a', 'a = 3');
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('freezes the snapshot', () => {
        const composer = createCqlComposer();
        composer.set('a', 'a = 1');
        expect(Object.isFrozen(composer.getSnapshot())).toBe(true);
        expect(Object.isFrozen(composer.getSnapshot().fragments)).toBe(true);
    });
});
