import { formatNumber } from '../shared/number.js';
import type { LegendClass, LegendEntry, LegendStop, LegendSymbol, SymbolShape } from './types.js';

type Raw = Record<string, unknown>;

const COLOR_PROPERTIES: Record<string, { property: string; shape: SymbolShape }> = {
    'fill': { property: 'fill-color', shape: 'fill' },
    'fill-extrusion': { property: 'fill-extrusion-color', shape: 'fill' },
    'line': { property: 'line-color', shape: 'line' },
    'circle': { property: 'circle-color', shape: 'point' },
    'symbol': { property: 'text-color', shape: 'point' },
};

const INTERPOLATE = new Set(['interpolate', 'interpolate-hcl', 'interpolate-lab']);

const isRecord = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);

const isZoom = (input: unknown): boolean => Array.isArray(input) && input[0] === 'zoom';

const label = (value: number): string => formatNumber(value, 2);

const colorOf = (layer: Raw): { color: unknown; shape: SymbolShape; id: string; title: string | null } | null => {
    const spec = typeof layer.type === 'string' ? COLOR_PROPERTIES[layer.type] : undefined;
    if (!spec) return null;
    const paint = isRecord(layer.paint) ? layer.paint : {};
    const metadata = isRecord(layer.metadata) ? layer.metadata : {};
    const title = typeof metadata['urdimbre:label'] === 'string' ? metadata['urdimbre:label'] : null;
    return { color: paint[spec.property], shape: spec.shape, id: typeof layer.id === 'string' ? layer.id : '', title };
};

const fromStep = (expression: unknown[]): LegendClass[] | null => {
    const [, input, base, ...pairs] = expression;
    if (isZoom(input) || typeof base !== 'string' || pairs.length % 2 !== 0) return null;
    const limits = pairs.filter((_, index) => index % 2 === 0);
    const colors = pairs.filter((_, index) => index % 2 === 1);
    if (!limits.every(value => typeof value === 'number') || !colors.every(value => typeof value === 'string')) return null;
    const values = limits as number[];
    const all = [base, ...colors as string[]];
    return all.map((color, index): LegendClass => {
        const min = values[index - 1];
        const max = values[index];
        if (min === undefined && max === undefined) return { label: '', color };
        if (min === undefined) return { label: `< ${label(max as number)}`, color, max: max as number };
        if (max === undefined) return { label: `≥ ${label(min)}`, color, min };
        return { label: `${label(min)} – ${label(max)}`, color, min, max };
    });
};

const fromInterpolate = (expression: unknown[]): LegendStop[] | null => {
    const [, , input, ...pairs] = expression;
    if (isZoom(input) || pairs.length === 0 || pairs.length % 2 !== 0) return null;
    const stops: LegendStop[] = [];
    for (let index = 0; index < pairs.length; index += 2) {
        const value = pairs[index];
        const color = pairs[index + 1];
        if (typeof value !== 'number' || typeof color !== 'string') return null;
        stops.push({ value, color });
    }
    return stops;
};

const fromMatch = (expression: unknown[], shape: SymbolShape): LegendSymbol[] | null => {
    const [, input, ...rest] = expression;
    if (isZoom(input) || rest.length < 3) return null;
    const pairs = rest.slice(0, rest.length - 1);
    const items: LegendSymbol[] = [];
    for (let index = 0; index < pairs.length; index += 2) {
        const values = pairs[index];
        const color = pairs[index + 1];
        if (typeof color !== 'string') return null;
        items.push({ label: (Array.isArray(values) ? values : [values]).map(String).join(', '), color, shape });
    }
    return items;
};

export const legendFromMapLibreStyle = (layerId: string, title: string, layers: readonly unknown[]): LegendEntry => {
    const colored = layers.filter(isRecord).map(colorOf).filter((item): item is NonNullable<ReturnType<typeof colorOf>> => item !== null);
    for (const { color, shape } of colored) {
        if (!Array.isArray(color)) continue;
        const operator = color[0];
        if (operator === 'step') {
            const classes = fromStep(color);
            if (classes) return { kind: 'classes', layerId, title, classes };
        }
        if (typeof operator === 'string' && INTERPOLATE.has(operator)) {
            const stops = fromInterpolate(color);
            if (stops) return { kind: 'ramp', layerId, title, stops };
        }
        if (operator === 'match') {
            const items = fromMatch(color, shape);
            if (items) return { kind: 'symbols', layerId, title, items };
        }
    }
    const items = colored
        .filter((item): item is typeof item & { color: string } => typeof item.color === 'string')
        .map(item => ({ label: item.title ?? (colored.length === 1 ? title : item.id), color: item.color, shape: item.shape }));
    return { kind: 'symbols', layerId, title, items };
};
