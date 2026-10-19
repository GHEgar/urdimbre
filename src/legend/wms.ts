import type { LayerDescription } from '../catalog/describe.js';
import type { LayerDef } from '../catalog/types.js';
import { canonicalUrl } from '../ogc/canonical.js';
import type { LegendEntry } from './types.js';

export interface WmsLegendOptions {
    width?: number;
    height?: number;
    format?: string;
    params?: Record<string, unknown>;
}

const SHARED = /^(TIME|ELEVATION|DIM_.+|CQL_FILTER)$/;

const first = (list: string | undefined): string | undefined => list?.split(',')[0]?.trim() || undefined;

export const legendUrlFromWms = (description: LayerDescription, def: LayerDef, options: WmsLegendOptions = {}): string | null => {
    const { source } = description;
    if (source.type !== 'wms-tiles' && source.type !== 'wms-image') return null;
    const shared = Object.fromEntries(Object.entries(source.params).filter(([key]) => SHARED.test(key)));
    return canonicalUrl(source.url, {
        ...options.params,
        ...shared,
        SERVICE: 'WMS',
        REQUEST: 'GetLegendGraphic',
        VERSION: '1.0.0',
        FORMAT: options.format ?? 'image/png',
        LAYER: first(source.params.LAYERS ?? def.wms?.layers),
        STYLE: first(source.params.STYLES ?? def.wms?.styles),
        WIDTH: options.width,
        HEIGHT: options.height,
    });
};

export const legendFromWms = (description: LayerDescription, def: LayerDef, options: WmsLegendOptions = {}): LegendEntry => {
    const title = def.title ?? def.id;
    const url = legendUrlFromWms(description, def, options) ?? def.legendUrl;
    if (!url) throw new RangeError(`Layer ${description.id} is not WMS and declares no legendUrl`);
    return { kind: 'image', layerId: description.id, title, url };
};
