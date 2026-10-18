import { BBOX_DECIMALS, formatNumber } from '../shared/number.js';

const READABLE: Record<string, string> = { '%2C': ',', '%3A': ':', '%2F': '/' };

const encode = (text: string): string =>
    encodeURIComponent(text).replace(/%2C|%3A|%2F/g, match => READABLE[match] ?? match);

const scalar = (value: unknown, decimals: number | undefined): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return formatNumber(value, decimals);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) throw new RangeError('Invalid date');
        return value.toISOString();
    }
    const text = String(value).trim();
    return text === '' ? null : text;
};

export const paramValue = (key: string, value: unknown): string | null => {
    const decimals = key === 'BBOX' ? BBOX_DECIMALS : undefined;
    if (Array.isArray(value)) {
        const items = value.map(item => scalar(item, decimals)).filter((item): item is string => item !== null);
        return items.length === 0 ? null : items.join(',');
    }
    return scalar(value, decimals);
};

export const splitUrl = (url: string): { base: string; query: Record<string, string> } => {
    const clean = url.split('#')[0] as string;
    const at = clean.indexOf('?');
    if (at < 0) return { base: clean, query: {} };
    const query: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(clean.slice(at + 1))) query[key] = value;
    return { base: clean.slice(0, at), query };
};

export const canonicalParams = (params: Record<string, unknown>): [string, string][] => {
    const merged = new Map<string, string | null>();
    for (const [key, value] of Object.entries(params)) {
        const name = key.trim().toUpperCase();
        if (name === '') continue;
        merged.set(name, paramValue(name, value));
    }
    return [...merged.entries()]
        .filter((entry): entry is [string, string] => entry[1] !== null)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
};

export const canonicalQuery = (params: Record<string, unknown>): string =>
    canonicalParams(params).map(([key, value]) => `${encode(key)}=${encode(value)}`).join('&');

export const canonicalUrl = (base: string, params: Record<string, unknown>): string => {
    const split = splitUrl(base);
    const query = canonicalQuery({ ...split.query, ...params });
    return query === '' ? split.base : `${split.base}?${query}`;
};
