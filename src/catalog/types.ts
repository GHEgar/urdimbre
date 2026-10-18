import type { Extent } from '../ogc/types.js';

export type LayerKind = 'wms' | 'vector-tiles' | 'pmtiles' | 'geojson' | 'xyz';

export type LayerCapability = 'time' | 'table' | 'hexbin' | '3d' | 'identify';

export type CrossOrigin = 'anonymous' | 'use-credentials' | null;

export interface WmsDef {
    url: string;
    layers: string;
    styles?: string;
    format?: string;
    tiled?: boolean;
    tileSize?: 256 | 512;
    version?: string;
}

export interface WfsDef {
    url: string;
    typeName: string;
    geometryName?: string;
    idField?: string;
}

export interface TilesDef {
    url: string;
    sourceLayer?: string;
}

export interface DimensionDef {
    default?: string;
    values?: string;
}

export interface LayerDef {
    id: string;
    title?: string;
    abstract?: string;
    tags?: readonly string[];
    kind: LayerKind;
    wms?: WmsDef;
    wfs?: WfsDef;
    tiles?: TilesDef;
    data?: unknown;
    dimensions?: Readonly<Record<string, DimensionDef>>;
    capabilities?: readonly LayerCapability[];
    attribution?: string;
    bbox?: Extent;
    legendUrl?: string;
    minZoom?: number;
    maxZoom?: number;
    crossOrigin?: CrossOrigin;
}

export interface Catalog {
    layers: readonly LayerDef[];
    hash: string;
    get(id: string): LayerDef | undefined;
}
