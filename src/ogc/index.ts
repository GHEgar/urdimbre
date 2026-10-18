export { canonicalUrl } from './canonical.js';
export { createOgcClient, DEFAULT_MAX_URL, DEFAULT_TTL } from './client.js';
export type { OgcClient, OgcClientOptions } from './client.js';
export { findLayer, flattenLayers, parseWmsCapabilities } from './capabilities.js';
export { OgcError } from './errors.js';
export type { OgcErrorDetails } from './errors.js';
export type {
    Extent,
    Feature,
    FeatureCollection,
    FeatureField,
    FeatureInfoRequest,
    FeatureSchema,
    GetFeatureRequest,
    RequestOptions,
    SortKey,
    UniqueOptions,
    WmsBoundingBox,
    WmsCapabilities,
    WmsDimension,
    WmsLayer,
    WmsStyle,
} from './types.js';
