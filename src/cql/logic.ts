import { BBOX_DECIMALS, formatNumber } from '../shared/number.js';
import { quoteIdentifier, quoteLiteral, quoteString } from './literal.js';

type Part = string | null | undefined;

const present = (parts: readonly Part[]): string[] =>
    parts.map(part => part?.trim()).filter((part): part is string => Boolean(part));

const join = (operator: 'AND' | 'OR', parts: readonly Part[]): string | null => {
    const valid = present(parts);
    if (valid.length === 0) return null;
    if (valid.length === 1) return valid[0] as string;
    return valid.map(part => `(${part})`).join(` ${operator} `);
};

export const and = (...parts: Part[]): string | null => join('AND', parts);

export const or = (...parts: Part[]): string | null => join('OR', parts);

export const not = (part: Part): string | null => {
    const valid = part?.trim();
    return valid ? `NOT (${valid})` : null;
};

export const inList = (field: string, values: readonly (string | number)[]): string | null => {
    const unique = [...new Set(values)];
    if (unique.length === 0) return null;
    const name = quoteIdentifier(field);
    if (unique.length === 1) return `${name} = ${quoteLiteral(unique[0] as string | number)}`;
    return `${name} IN (${unique.map(quoteLiteral).join(', ')})`;
};

export const between = (field: string, from: string | number, to: string | number): string => {
    const [low, high] = typeof from === 'number' && typeof to === 'number' && from > to ? [to, from] : [from, to];
    return `${quoteIdentifier(field)} BETWEEN ${quoteLiteral(low)} AND ${quoteLiteral(high)}`;
};

export const bbox = (geometryField: string, box: readonly [number, number, number, number], srs?: string): string => {
    const coordinates = box.map(value => formatNumber(value, BBOX_DECIMALS)).join(', ');
    const suffix = srs ? `, ${quoteString(srs)}` : '';
    return `BBOX(${quoteIdentifier(geometryField)}, ${coordinates}${suffix})`;
};
