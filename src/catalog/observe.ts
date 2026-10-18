import { describe } from './describe.js';
import type { LayerDescription } from './describe.js';
import type { LayerState, LayerStateSnapshot } from './state.js';
import type { Catalog } from './types.js';

export interface DescriptionSource {
    getDescriptions(): LayerDescription[];
    subscribe(listener: () => void): () => void;
}

export const describeState = (catalog: Catalog, state: LayerState): DescriptionSource => {
    let seen: LayerStateSnapshot | null = null;
    let descriptions: LayerDescription[] = [];
    return {
        getDescriptions() {
            const snapshot = state.getSnapshot();
            if (snapshot !== seen) {
                seen = snapshot;
                descriptions = describe(catalog, snapshot);
            }
            return descriptions;
        },
        subscribe: listener => state.subscribe(listener),
    };
};
