import type { LayerDescription } from '../catalog/describe.js';
import type { Catalog, GeometryType, LayerDef } from '../catalog/types.js';
import type { LegendEntry, SymbolShape } from './types.js';
import { legendFromWms } from './wms.js';
import type { WmsLegendOptions } from './wms.js';

export interface LegendForStateOptions extends WmsLegendOptions {
    custom?: (description: LayerDescription, def: LayerDef) => LegendEntry | null | undefined;
    hidden?: boolean;
    symbolColor?: string | ((description: LayerDescription, def: LayerDef) => string | null | undefined);
    shapeLabels?: Partial<Readonly<Record<SymbolShape, string>>>;
}

export const DEFAULT_SYMBOL_COLOR = 'currentColor';

const SHAPES: Record<GeometryType, SymbolShape> = { point: 'point', line: 'line', polygon: 'fill' };

const GEOJSON_SHAPES: Record<string, SymbolShape> = {
    Point: 'point',
    MultiPoint: 'point',
    LineString: 'line',
    MultiLineString: 'line',
    Polygon: 'fill',
    MultiPolygon: 'fill',
};

const SHAPE_LABELS: Record<SymbolShape, string> = { point: 'Points', line: 'Lines', fill: 'Areas' };

const VECTOR = new Set(['vector-tiles', 'pmtiles', 'geojson']);

const geometryTypes = (data: unknown): string[] => {
    if (data === null || typeof data !== 'object') return [];
    const value = data as { type?: unknown; features?: unknown; geometry?: unknown; geometries?: unknown };
    if (value.type === 'FeatureCollection' && Array.isArray(value.features)) return value.features.flatMap(geometryTypes);
    if (value.type === 'Feature') return geometryTypes(value.geometry);
    if (value.type === 'GeometryCollection' && Array.isArray(value.geometries)) return value.geometries.flatMap(geometryTypes);
    return typeof value.type === 'string' ? [value.type] : [];
};

export const shapesOf = (def: LayerDef): SymbolShape[] => {
    if (def.geometryType) return [SHAPES[def.geometryType]];
    if (def.data === undefined || typeof def.data === 'string') return [];
    const found = new Set(geometryTypes(def.data).flatMap(type => (GEOJSON_SHAPES[type] ? [GEOJSON_SHAPES[type]] : [])));
    return (['point', 'line', 'fill'] as const).filter(shape => found.has(shape));
};

const symbolsOf = (description: LayerDescription, def: LayerDef, options: LegendForStateOptions): LegendEntry | null => {
    const shapes = shapesOf(def);
    if (shapes.length === 0) return null;
    const title = def.title ?? def.id;
    const own = typeof options.symbolColor === 'function' ? options.symbolColor(description, def) : options.symbolColor;
    const color = own ?? DEFAULT_SYMBOL_COLOR;
    const labels = { ...SHAPE_LABELS, ...options.shapeLabels };
    const items = shapes.map(shape => ({ label: shapes.length === 1 ? title : labels[shape], color, shape }));
    return { kind: 'symbols', layerId: def.id, title, items };
};

export const legendForState = (catalog: Catalog, descriptions: readonly LayerDescription[], options: LegendForStateOptions = {}): LegendEntry[] => {
    const { custom: _custom, hidden: _hidden, symbolColor: _color, shapeLabels: _labels, ...wms } = options;
    const { custom, hidden } = options;
    return [...descriptions]
        .filter(description => hidden || description.visible)
        .sort((a, b) => b.zIndex - a.zIndex)
        .flatMap(description => {
            const def = catalog.get(description.id);
            if (!def) return [];
            const own = custom?.(description, def);
            if (own) return [own];
            const isWms = description.source.type === 'wms-tiles' || description.source.type === 'wms-image';
            if (isWms || def.legendUrl) return [legendFromWms(description, def, wms)];
            const symbols = VECTOR.has(description.source.type) ? symbolsOf(description, def, options) : null;
            return symbols ? [symbols] : [];
        });
};
