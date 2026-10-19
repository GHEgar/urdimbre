const STRUCTURAL: Record<string, string> = { '~': '%7E', '!': '%21', '\'': '%27', '(': '%28', ')': '%29', '*': '%2A' };
const READABLE: Record<string, string> = { '%3A': ':', '%2F': '/', '%3D': '=' };

export const escapeToken = (text: string): string =>
    encodeURIComponent(text).replace(/[~!'()*]/g, match => STRUCTURAL[match] ?? match);

export const escapeValue = (text: string): string =>
    escapeToken(text).replace(/%3A|%2F|%3D/g, match => READABLE[match] ?? match);

export const unescapeToken = (text: string): string | null => {
    try {
        return decodeURIComponent(text.replace(/\+/g, ' '));
    } catch {
        return null;
    }
};

export const toBase64Url = (text: string): string => {
    let binary = '';
    for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const fromBase64Url = (text: string): string | null => {
    if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
    try {
        const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return null;
    }
};

export const splitQuery = (query: string): [string, string][] => {
    const bare = query.split('#')[0] ?? '';
    const clean = /^[a-z][a-z0-9+.-]*:\/\//i.test(bare) ? bare.slice(bare.indexOf('?') + 1 || bare.length) : bare.replace(/^\?/, '');
    if (clean === '') return [];
    return clean.split('&').filter(Boolean).map(pair => {
        const at = pair.indexOf('=');
        return at < 0 ? [pair, ''] : [pair.slice(0, at), pair.slice(at + 1)];
    });
};

export const coordinateDecimals = (zoom: number): number => Math.max(2, Math.min(7, Math.round(zoom * 0.3)));
