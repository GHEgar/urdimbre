export type Extent = readonly [number, number, number, number];

export interface RequestOptions {
    signal?: AbortSignal;
}

export interface WmsBoundingBox {
    crs: string;
    extent: Extent;
}

export interface WmsStyle {
    name: string;
    title: string | null;
    legendUrl: string | null;
}

export interface WmsDimension {
    name: string;
    units: string | null;
    default: string | null;
    values: string;
}

export interface WmsLayer {
    name: string | null;
    title: string;
    abstract: string | null;
    queryable: boolean;
    crs: string[];
    geographicBbox: Extent | null;
    bbox: WmsBoundingBox[];
    styles: WmsStyle[];
    dimensions: WmsDimension[];
    children: WmsLayer[];
}

export interface WmsCapabilities {
    version: string;
    title: string;
    layers: WmsLayer[];
}

export interface Feature {
    type: 'Feature';
    id?: string | number;
    geometry: unknown;
    properties: Record<string, unknown> | null;
    bbox?: number[];
}

export interface FeatureCollection {
    type: 'FeatureCollection';
    features: Feature[];
    numberMatched?: number;
    numberReturned?: number;
    totalFeatures?: number | 'unknown';
}

export interface FeatureInfoRequest {
    layers: string | readonly string[];
    queryLayers?: string | readonly string[];
    styles?: string | readonly string[];
    crs: string;
    bbox: Extent;
    width: number;
    height: number;
    i: number;
    j: number;
    infoFormat?: string;
    featureCount?: number;
    cql?: string | null;
    time?: string | null;
    params?: Record<string, unknown>;
}

export interface SortKey {
    field: string;
    direction?: 'asc' | 'desc';
}

export interface GetFeatureRequest {
    typeName: string;
    cql?: string | null;
    bbox?: Extent | null;
    geometryName?: string;
    srsName?: string | null;
    propertyNames?: readonly string[] | null;
    sortBy?: string | readonly SortKey[] | null;
    startIndex?: number;
    count?: number | null;
    outputFormat?: string;
    params?: Record<string, unknown>;
}

export interface FeatureField {
    name: string;
    type: string;
    nillable: boolean;
}

export interface FeatureSchema {
    typeName: string;
    geometry: { name: string; type: string } | null;
    fields: FeatureField[];
}

export interface UniqueOptions extends RequestOptions {
    cql?: string | null;
    limit?: number;
}
