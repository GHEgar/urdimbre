import type { Extent } from '../ogc/types.js';
import type { CrossOrigin, DimensionDef, LayerCapability, LayerDef, LayerKind, TilesDef, WfsDef, WmsDef } from './types.js';

export class CatalogError extends Error {
    readonly path: string;

    constructor(path: string, message: string) {
        super(`${path} ${message}`);
        this.name = 'CatalogError';
        this.path = path;
    }
}

type Raw = Record<string, unknown>;

export const LAYER_KINDS: readonly LayerKind[] = ['wms', 'vector-tiles', 'pmtiles', 'geojson', 'xyz'];
const CAPABILITIES: readonly LayerCapability[] = ['time', 'table', 'hexbin', '3d', 'identify'];
const LAYER_FIELDS = [
    'id', 'title', 'abstract', 'tags', 'kind', 'wms', 'wfs', 'tiles', 'data', 'dimensions', 'capabilities',
    'attribution', 'bbox', 'legendUrl', 'minZoom', 'maxZoom', 'crossOrigin',
];
const KIND_SERVICE: Record<LayerKind, 'wms' | 'tiles' | 'data'> = {
    'wms': 'wms',
    'vector-tiles': 'tiles',
    'pmtiles': 'tiles',
    'xyz': 'tiles',
    'geojson': 'data',
};

const fail = (path: string, message: string): never => {
    throw new CatalogError(path, message);
};

export const isRecord = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);

const record = (value: unknown, path: string, allowed: readonly string[]): Raw => {
    if (!isRecord(value)) return fail(path, 'must be an object');
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) fail(`${path}.${key}`, 'is not a known field');
    }
    return value;
};

const text = (value: unknown, path: string, required = false): string | undefined => {
    if (value === undefined) return required ? fail(path, 'is required') : undefined;
    if (typeof value !== 'string' || value.trim() === '') return fail(path, 'must be a non-empty string');
    return value.trim();
};

const choice = <T>(value: unknown, path: string, options: readonly T[]): T | undefined => {
    if (value === undefined) return undefined;
    if (!options.includes(value as T)) return fail(path, `must be one of ${options.map(String).join(', ')}`);
    return value as T;
};

const flag = (value: unknown, path: string): boolean | undefined => {
    if (value === undefined) return undefined;
    return typeof value === 'boolean' ? value : fail(path, 'must be a boolean');
};

const zoom = (value: unknown, path: string): number | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 30) return fail(path, 'must be a number from 0 to 30');
    return value;
};

const list = <T>(value: unknown, path: string, item: (entry: unknown, at: string) => T): T[] | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return fail(path, 'must be an array');
    return value.map((entry, index) => item(entry, `${path}[${index}]`));
};

export const compact = <T>(fields: Record<string, unknown>): T =>
    Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as T;

const extent = (value: unknown, path: string): Extent | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length !== 4 || !value.every(item => typeof item === 'number' && Number.isFinite(item))) {
        return fail(path, 'must be [minX, minY, maxX, maxY]');
    }
    const [minX, minY, maxX, maxY] = value as number[] as [number, number, number, number];
    if (minX > maxX || minY > maxY) fail(path, 'must have its minimum before its maximum');
    return [minX, minY, maxX, maxY];
};

const wms = (value: unknown, path: string): WmsDef => {
    const raw = record(value, path, ['url', 'layers', 'styles', 'format', 'tiled', 'tileSize', 'version']);
    return compact<WmsDef>({
        url: text(raw.url, `${path}.url`, true),
        layers: text(raw.layers, `${path}.layers`, true),
        styles: text(raw.styles, `${path}.styles`),
        format: text(raw.format, `${path}.format`),
        tiled: flag(raw.tiled, `${path}.tiled`),
        tileSize: choice(raw.tileSize, `${path}.tileSize`, [256, 512] as const),
        version: choice(raw.version, `${path}.version`, ['1.1.1', '1.3.0'] as const),
    });
};

const wfs = (value: unknown, path: string): WfsDef => {
    const raw = record(value, path, ['url', 'typeName', 'geometryName', 'idField']);
    return compact<WfsDef>({
        url: text(raw.url, `${path}.url`, true),
        typeName: text(raw.typeName, `${path}.typeName`, true),
        geometryName: text(raw.geometryName, `${path}.geometryName`),
        idField: text(raw.idField, `${path}.idField`),
    });
};

const tiles = (value: unknown, path: string): TilesDef => {
    const raw = record(value, path, ['url', 'sourceLayer']);
    return compact<TilesDef>({ url: text(raw.url, `${path}.url`, true), sourceLayer: text(raw.sourceLayer, `${path}.sourceLayer`) });
};

const dimensions = (value: unknown, path: string): Record<string, DimensionDef> | undefined => {
    if (value === undefined) return undefined;
    if (!isRecord(value)) return fail(path, 'must be an object');
    const result: Record<string, DimensionDef> = {};
    for (const [key, entry] of Object.entries(value)) {
        const name = key.trim().toLowerCase();
        const at = `${path}.${key}`;
        if (name === '') fail(at, 'needs a name');
        if (name in result) fail(at, 'repeats a dimension name');
        const raw = record(entry, at, ['default', 'values']);
        result[name] = compact<DimensionDef>({ default: text(raw.default, `${at}.default`), values: text(raw.values, `${at}.values`) });
    }
    return result;
};

const data = (value: unknown, path: string): unknown => {
    if (value === undefined) return undefined;
    if (typeof value === 'string') return text(value, path);
    if (!isRecord(value)) return fail(path, 'must be a URL or a GeoJSON object');
    return structuredClone(value);
};

const checkKind = (layer: LayerDef, path: string): void => {
    const service = KIND_SERVICE[layer.kind];
    for (const field of ['wms', 'tiles', 'data'] as const) {
        if (field !== service && layer[field] !== undefined) fail(`${path}.${field}`, `does not fit kind ${layer.kind}`);
    }
    if (service === 'data' && layer.data === undefined && layer.wfs === undefined) fail(`${path}.data`, 'or wfs is required for kind geojson');
    else if (service !== 'data' && layer[service] === undefined) fail(`${path}.${service}`, `is required for kind ${layer.kind}`);
    if (layer.kind === 'xyz' && !/\{z\}/.test(layer.tiles?.url ?? '')) fail(`${path}.tiles.url`, 'needs {z}, {x} and {y} for kind xyz');
    if (layer.minZoom !== undefined && layer.maxZoom !== undefined && layer.minZoom > layer.maxZoom) fail(`${path}.minZoom`, 'is above maxZoom');
};

export const validateLayer = (value: unknown, path: string): LayerDef => {
    const raw = record(value, path, LAYER_FIELDS);
    const kind = raw.kind === undefined ? fail(`${path}.kind`, 'is required') : choice(raw.kind, `${path}.kind`, LAYER_KINDS);
    const layer = compact<LayerDef>({
        id: text(raw.id, `${path}.id`, true),
        title: text(raw.title, `${path}.title`),
        abstract: text(raw.abstract, `${path}.abstract`),
        tags: list(raw.tags, `${path}.tags`, (entry, at) => text(entry, at, true) as string),
        kind,
        wms: raw.wms === undefined ? undefined : wms(raw.wms, `${path}.wms`),
        wfs: raw.wfs === undefined ? undefined : wfs(raw.wfs, `${path}.wfs`),
        tiles: raw.tiles === undefined ? undefined : tiles(raw.tiles, `${path}.tiles`),
        data: data(raw.data, `${path}.data`),
        dimensions: dimensions(raw.dimensions, `${path}.dimensions`),
        capabilities: list(raw.capabilities, `${path}.capabilities`, (entry, at) => choice(entry, at, CAPABILITIES) ?? fail(at, 'is required')),
        attribution: text(raw.attribution, `${path}.attribution`),
        bbox: extent(raw.bbox, `${path}.bbox`),
        legendUrl: text(raw.legendUrl, `${path}.legendUrl`),
        minZoom: zoom(raw.minZoom, `${path}.minZoom`),
        maxZoom: zoom(raw.maxZoom, `${path}.maxZoom`),
        crossOrigin: choice<CrossOrigin>(raw.crossOrigin, `${path}.crossOrigin`, ['anonymous', 'use-credentials', null]),
    });
    checkKind(layer, path);
    return layer;
};
