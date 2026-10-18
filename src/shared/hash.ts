const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(item => (item === undefined ? null : sortKeys(item)));
    if (value === null || typeof value !== 'object') return value;
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([key, item]) => [key, sortKeys(item)]));
};

export const stableJson = (value: unknown): string => JSON.stringify(sortKeys(value)) ?? 'null';

export const fnv1a = (text: string): string => {
    let hash = 0x811c9dc5;
    for (const byte of new TextEncoder().encode(text)) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
};
