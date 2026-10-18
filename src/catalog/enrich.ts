import { findLayer } from '../ogc/capabilities.js';
import type { OgcClient } from '../ogc/client.js';
import type { RequestOptions, WmsCapabilities, WmsLayer } from '../ogc/types.js';
import { defineCatalog } from './define.js';
import type { Catalog, DimensionDef, LayerDef } from './types.js';
import { compact } from './validate.js';

const legendOf = (source: WmsLayer, styles: string | undefined): string | undefined => {
    const wanted = styles?.split(',')[0]?.trim();
    const style = (wanted ? source.styles.find(item => item.name === wanted) : undefined) ?? source.styles[0];
    return style?.legendUrl ?? undefined;
};

const mergeDimensions = (declared: LayerDef['dimensions'], source: WmsLayer): LayerDef['dimensions'] => {
    if (source.dimensions.length === 0) return declared;
    const result: Record<string, DimensionDef> = {};
    for (const dimension of source.dimensions) {
        result[dimension.name] = compact<DimensionDef>({ default: dimension.default ?? undefined, values: dimension.values || undefined });
    }
    for (const [name, dimension] of Object.entries(declared ?? {})) result[name] = { ...result[name], ...dimension };
    return result;
};

const enrichLayer = (layer: LayerDef, capabilities: WmsCapabilities | undefined): LayerDef => {
    const source = capabilities && layer.wms ? findLayer(capabilities, layer.wms.layers) : null;
    if (!source) return layer;
    return compact<LayerDef>({
        ...layer,
        title: layer.title ?? (source.title || undefined),
        abstract: layer.abstract ?? source.abstract ?? undefined,
        bbox: layer.bbox ?? source.geographicBbox ?? undefined,
        legendUrl: layer.legendUrl ?? legendOf(source, layer.wms?.styles),
        dimensions: mergeDimensions(layer.dimensions, source),
    });
};

export const enrichFromCapabilities = async (catalog: Catalog, client: OgcClient, options: RequestOptions = {}): Promise<Catalog> => {
    const urls = [...new Set(catalog.layers.flatMap(layer => (layer.wms ? [layer.wms.url] : [])))];
    const answers = await Promise.all(urls.map(url => client.wmsCapabilities(url, options)));
    const byUrl = new Map(urls.map((url, index) => [url, answers[index]]));
    return defineCatalog(catalog.layers.map(layer => enrichLayer(layer, layer.wms ? byUrl.get(layer.wms.url) : undefined)));
};
