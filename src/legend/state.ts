import type { LayerDescription } from '../catalog/describe.js';
import type { Catalog, LayerDef } from '../catalog/types.js';
import type { LegendEntry } from './types.js';
import { legendFromWms } from './wms.js';
import type { WmsLegendOptions } from './wms.js';

export interface LegendForStateOptions extends WmsLegendOptions {
    custom?: (description: LayerDescription, def: LayerDef) => LegendEntry | null | undefined;
    hidden?: boolean;
}

export const legendForState = (catalog: Catalog, descriptions: readonly LayerDescription[], options: LegendForStateOptions = {}): LegendEntry[] => {
    const { custom, hidden, ...wms } = options;
    return [...descriptions]
        .filter(description => hidden || description.visible)
        .sort((a, b) => b.zIndex - a.zIndex)
        .flatMap(description => {
            const def = catalog.get(description.id);
            if (!def) return [];
            const own = custom?.(description, def);
            if (own) return [own];
            const isWms = description.source.type === 'wms-tiles' || description.source.type === 'wms-image';
            return isWms || def.legendUrl ? [legendFromWms(description, def, wms)] : [];
        });
};
