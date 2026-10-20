import { describe } from './describe.js';
import type { LayerDescription } from './describe.js';
import { isLiveCatalog } from './live.js';
import type { LayerState, LayerStateSnapshot } from './state.js';
import type { Catalog } from './types.js';

export interface DescriptionSource {
    getDescriptions(): LayerDescription[];
    subscribe(listener: () => void): () => void;
}

export const describeState = (catalog: Catalog, state: LayerState): DescriptionSource => {
    let seen: LayerStateSnapshot | null = null;
    let seenHash: string | null = null;
    let descriptions: LayerDescription[] = [];
    return {
        getDescriptions() {
            const snapshot = state.getSnapshot();
            if (snapshot !== seen || catalog.hash !== seenHash) {
                seen = snapshot;
                seenHash = catalog.hash;
                descriptions = describe(catalog, snapshot);
            }
            return descriptions;
        },
        subscribe(listener) {
            const fromState = state.subscribe(listener);
            const fromCatalog = isLiveCatalog(catalog) ? catalog.subscribe(listener) : null;
            return () => {
                fromState();
                fromCatalog?.();
            };
        },
    };
};
