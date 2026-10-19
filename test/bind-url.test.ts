import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLayerState, defineCatalog } from '../src/catalog/index.js';
import { applyLayerState, bindUrl, readLayerState } from '../src/state/index.js';
import type { PortalState, ViewState } from '../src/state/index.js';
import { catalogInput } from './layers.js';

const catalog = defineCatalog(catalogInput());

const setup = (search = '') => {
    const location = { search, hash: '#map' };
    const calls: [string, string][] = [];
    const move = (url: string): void => {
        location.search = url.slice(0, url.indexOf('#'));
    };
    const history = {
        pushState: (_: unknown, __: string, url?: string | URL | null) => {
            calls.push(['push', String(url)]);
            move(String(url));
        },
        replaceState: (_: unknown, __: string, url?: string | URL | null) => {
            calls.push(['replace', String(url)]);
            move(String(url));
        },
    };
    const events = new EventTarget();
    const layers = createLayerState(catalog, { active: ['osm'] });
    let view: ViewState = { center: [-103.35, 20.67], zoom: 10, bearing: 0, pitch: 0 };
    let tool: string | null = null;
    const listeners = new Set<() => void>();
    const notify = (): void => listeners.forEach(listener => listener());
    layers.subscribe(notify);
    const applied: Partial<PortalState>[] = [];
    const unbind = bindUrl({
        catalog,
        history,
        location,
        events,
        read: () => ({ view, ...readLayerState(layers), tool }),
        apply(partial) {
            applied.push(partial);
            if (partial.view) view = partial.view;
            applyLayerState(layers, partial);
            tool = partial.tool ?? null;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    });
    return {
        location, calls, events, layers, applied, unbind,
        setView(next: Partial<ViewState>) {
            view = { ...view, ...next };
            notify();
        },
        setTool(next: string | null) {
            tool = next;
            notify();
        },
        back(search: string) {
            location.search = search;
            events.dispatchEvent(new Event('popstate'));
        },
    };
};

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('bindUrl', () => {
    it('applies the URL it starts with and normalizes it with replaceState', () => {
        const page = setup('?l=states:50,old&v=20,-103,8');
        expect(page.applied).toHaveLength(1);
        expect(page.layers.getSnapshot().active).toEqual(['states']);
        expect(page.calls).toEqual([['replace', '?v=20,-103,8,0,0&l=states:50#map']]);
    });

    it('writes the initial state without applying an empty URL', () => {
        const page = setup();
        expect(page.applied).toEqual([]);
        expect(page.calls).toEqual([['replace', '?v=20.67,-103.35,10,0,0&l=osm#map']]);
    });

    it('debounces map moves into one replaceState', () => {
        const page = setup();
        page.calls.length = 0;
        page.setView({ zoom: 11 });
        page.setView({ zoom: 12 });
        page.setView({ zoom: 13 });
        vi.advanceTimersByTime(249);
        expect(page.calls).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(page.calls).toEqual([['replace', '?v=20.67,-103.35,13,0,0&l=osm#map']]);
    });

    it('pushes layer and tool changes at once, with the latest view', () => {
        const page = setup();
        page.calls.length = 0;
        page.setView({ zoom: 12 });
        page.layers.add('states');
        page.setTool('measure');
        vi.advanceTimersByTime(1000);
        expect(page.calls).toEqual([
            ['push', '?v=20.67,-103.35,12,0,0&l=states,osm#map'],
            ['push', '?v=20.67,-103.35,12,0,0&l=states,osm&t=measure#map'],
        ]);
    });

    it('applies popstate without writing back', () => {
        const page = setup();
        const first = page.location.search;
        page.layers.add('states');
        page.calls.length = 0;
        page.back(first);
        expect(page.layers.getSnapshot().active).toEqual(['osm']);
        expect(page.calls).toEqual([]);
        page.setView({ zoom: 10 });
        vi.advanceTimersByTime(300);
        expect(page.calls).toEqual([]);
    });

    it('stops listening after cleanup', () => {
        const page = setup();
        page.calls.length = 0;
        page.setView({ zoom: 4 });
        page.unbind();
        vi.advanceTimersByTime(300);
        page.layers.add('states');
        page.back('?v=0,0,1&l=roads');
        expect(page.calls).toEqual([]);
        expect(page.applied).toEqual([]);
    });

    it('takes history and location from globalThis when called, and fails without them', () => {
        vi.stubGlobal('history', undefined);
        vi.stubGlobal('location', undefined);
        const options = { catalog, read: () => ({}) as PortalState, apply: () => undefined, subscribe: () => () => undefined };
        expect(() => bindUrl(options)).toThrow(/history and location/);
        const replaceState = vi.fn();
        vi.stubGlobal('history', { pushState: vi.fn(), replaceState });
        vi.stubGlobal('location', { search: '', hash: '' });
        const read = (): PortalState => ({ view: { center: [0, 0], zoom: 2, bearing: 0, pitch: 0 }, layers: createLayerState(catalog).getSnapshot() });
        bindUrl({ ...options, read })();
        expect(replaceState).toHaveBeenCalledWith(null, '', '?v=0,0,2,0,0&l=');
    });
});
