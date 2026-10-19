import { formatNumber } from '../shared/number.js';
import type { LegendClass, LegendEntry } from './types.js';

export interface ClassLike {
    min: number;
    max: number;
    count?: number;
    color?: string;
    label?: string;
    classIndex?: number;
}

export interface ClassesOptions {
    colors?: readonly string[];
    format?: (value: number) => string;
}

const fromBreaks = (breaks: readonly number[]): ClassLike[] =>
    breaks.slice(0, -1).map((min, index) => ({ min, max: breaks[index + 1] as number, classIndex: index }));

export const legendFromClasses = (
    layerId: string,
    title: string,
    classes: readonly ClassLike[] | { breaks: readonly number[] },
    counts?: readonly number[],
    options: ClassesOptions = {},
): LegendEntry => {
    const list = 'breaks' in classes ? fromBreaks(classes.breaks) : classes;
    const format = options.format ?? ((value: number) => formatNumber(value, 2));
    return {
        kind: 'classes',
        layerId,
        title,
        classes: list.map((item, index): LegendClass => {
            const position = item.classIndex ?? index;
            const color = item.color ?? options.colors?.[position];
            if (!color) throw new RangeError(`Class ${position} of ${layerId} has no color`);
            const count = counts?.[position] ?? item.count;
            const entry: LegendClass = { label: item.label ?? `${format(item.min)} – ${format(item.max)}`, color, min: item.min, max: item.max };
            if (count !== undefined) entry.count = count;
            return entry;
        }),
    };
};
