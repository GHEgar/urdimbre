import { quoteIdentifier, quoteLiteral } from '../cql/literal.js';
import { EXCLUDE, or } from '../cql/logic.js';

export interface ClassBounds {
    min?: number;
    max?: number;
}

export type ClassesInput = readonly ClassBounds[] | { breaks: readonly number[] };

export interface ClassFilterOptions {
    lastInclusive?: boolean;
}

const boundsOf = (classes: ClassesInput): readonly ClassBounds[] => {
    if (!('breaks' in classes)) return classes;
    const { breaks } = classes;
    return breaks.slice(0, -1).map((min, index) => ({ min, max: breaks[index + 1] as number }));
};

const pieces = (field: string, classes: ClassesInput, options: ClassFilterOptions): (string | null)[] => {
    const name = quoteIdentifier(field);
    const list = boundsOf(classes);
    const inclusive = options.lastInclusive ?? true;
    return list.map((item, index) => {
        const parts: string[] = [];
        if (item.min !== undefined) parts.push(`${name} >= ${quoteLiteral(item.min)}`);
        if (item.max !== undefined) parts.push(`${name} ${inclusive && index === list.length - 1 ? '<=' : '<'} ${quoteLiteral(item.max)}`);
        return parts.length === 0 ? null : parts.join(' AND ');
    });
};

export const classFilterCql = (
    field: string,
    classes: ClassesInput,
    visible: Iterable<number>,
    options: ClassFilterOptions = {},
): string | null => {
    const all = pieces(field, classes, options);
    const chosen = [...new Set(visible)].filter(index => Number.isInteger(index) && index >= 0 && index < all.length).sort((a, b) => a - b);
    if (all.length === 0 || chosen.length === all.length) return null;
    if (chosen.length === 0) return EXCLUDE;
    const parts = chosen.map(index => all[index] as string | null);
    if (parts.some(part => part === null)) return null;
    return or(...parts);
};

const parse = (text: string, all: readonly (string | null)[]): number[] | null => {
    const single = all.indexOf(text);
    if (single >= 0) return [single];
    const found: number[] = [];
    let rest = text;
    while (rest !== '') {
        const from = (found.at(-1) ?? -1) + 1;
        const index = all.findIndex((piece, at) => at >= from && piece !== null && rest.startsWith(`(${piece})`));
        if (index < 0) return null;
        found.push(index);
        rest = rest.slice((all[index] as string).length + 2);
        if (rest.startsWith(' OR ')) rest = rest.slice(4);
        else if (rest !== '') return null;
    }
    return found;
};

export const classesFromCql = (
    fragment: string | null | undefined,
    field: string,
    classes: ClassesInput,
    options: ClassFilterOptions = {},
): Set<number> | null => {
    const all = pieces(field, classes, options);
    const text = fragment?.trim() ?? '';
    if (text === '') return new Set(all.keys());
    if (text === EXCLUDE) return new Set();
    const found = parse(text, all);
    if (!found || classFilterCql(field, classes, found, options) !== text) return null;
    return new Set(found);
};
