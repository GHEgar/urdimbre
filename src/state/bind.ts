import type { Catalog } from '../catalog/types.js';
import { decodeState } from './decode.js';
import { encodeState } from './encode.js';
import { RESERVED_KEYS, VIEW_KEY } from './types.js';
import type { PortalState } from './types.js';

type PopstateTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface BindUrlOptions {
    catalog: Catalog;
    read(): PortalState;
    apply(partial: Partial<PortalState>): void;
    subscribe(listener: () => void): () => void;
    history?: Pick<History, 'replaceState' | 'pushState'>;
    location?: Pick<Location, 'search' | 'hash'>;
    events?: PopstateTarget;
    debounce?: number;
}

export const DEFAULT_URL_DEBOUNCE = 250;

const withoutView = (query: string): string => query.split('&').filter(pair => !pair.startsWith(`${VIEW_KEY}=`)).join('&');

const hasState = (query: string): boolean =>
    query.replace(/^\?/, '').split('&').some(pair => RESERVED_KEYS.includes(pair.split('=')[0] ?? ''));

export const bindUrl = (options: BindUrlOptions): () => void => {
    const history = options.history ?? globalThis.history;
    const location = options.location ?? globalThis.location;
    const events = options.events ?? (typeof globalThis.addEventListener === 'function' ? globalThis : undefined);
    if (!history || !location) throw new Error('bindUrl needs history and location');
    const delay = options.debounce ?? DEFAULT_URL_DEBOUNCE;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let applying = false;
    let written = location.search.replace(/^\?/, '');

    const cancel = (): void => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
    };

    const write = (mode: 'push' | 'replace'): void => {
        cancel();
        const query = encodeState(options.read(), options.catalog);
        if (query === written) return;
        written = query;
        const url = `?${query}${location.hash}`;
        if (mode === 'push') history.pushState(null, '', url);
        else history.replaceState(null, '', url);
    };

    const restore = (): void => {
        applying = true;
        try {
            options.apply(decodeState(location.search, options.catalog));
        } finally {
            applying = false;
        }
    };

    const changed = (): void => {
        if (applying) return;
        const query = encodeState(options.read(), options.catalog);
        if (query === written) return cancel();
        if (withoutView(query) !== withoutView(written)) return write('push');
        cancel();
        timer = setTimeout(() => write('replace'), delay);
    };

    const popstate = (): void => {
        cancel();
        restore();
        written = encodeState(options.read(), options.catalog);
    };

    if (hasState(location.search)) restore();
    write('replace');
    const unsubscribe = options.subscribe(changed);
    events?.addEventListener('popstate', popstate);
    return () => {
        cancel();
        unsubscribe();
        events?.removeEventListener('popstate', popstate);
    };
};
