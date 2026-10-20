import { normalizeName } from './normalize.js';
import type { Coordinate, Place, SearchOptions } from './types.js';

export interface PlaceIndexOptions {
    kindRank?: Readonly<Record<string, number>>;
}

export interface PlaceIndex {
    readonly size: number;
    search(query: string, options?: SearchOptions): Place[];
}

interface Entry {
    place: Place;
    key: string;
    words: string[];
}

const DEFAULT_LIMIT = 8;

const distance = (a: Coordinate, b: Coordinate): number => {
    const dx = (a[0] - b[0]) * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
    const dy = a[1] - b[1];
    return Math.hypot(dx, dy);
};

const tier = (score: number): number => (score === 0 ? 0 : score <= 2 ? 1 : 2);

const matchScore = (entry: Entry, query: string, terms: string[]): number => {
    if (entry.key === query) return 0;
    if (entry.key.startsWith(query)) return 1;
    if (terms.every((term) => entry.words.some((word) => word.startsWith(term)))) return 2;
    if (entry.key.includes(query)) return 3;
    return -1;
};

export const createPlaceIndex = (places: readonly Place[], options: PlaceIndexOptions = {}): PlaceIndex => {
    const rank = options.kindRank ?? {};
    const entries: Entry[] = places.map((place) => {
        const key = normalizeName(place.name);
        return { place, key, words: key.split(' ') };
    });
    return {
        size: entries.length,
        search(query, { limit = DEFAULT_LIMIT, near, bands = [] } = {}) {
            const normalized = normalizeName(query);
            if (!normalized) return [];
            const terms = normalized.split(' ');
            const found: { entry: Entry; score: number; kind: number; far: number; band: number }[] = [];
            const bandOf = (far: number): number => {
                const index = bands.findIndex(limit => far < limit);
                return index < 0 ? bands.length : index;
            };
            for (const entry of entries) {
                const score = matchScore(entry, normalized, terms);
                if (score < 0) continue;
                const far = near ? distance(near, entry.place.coordinate) : 0;
                found.push({ entry, score, kind: rank[entry.place.kind] ?? 99, far, band: near ? bandOf(far) : 0 });
            }
            found.sort((a, b) => a.band - b.band || tier(a.score) - tier(b.score) || a.kind - b.kind || a.far - b.far || a.score - b.score || a.entry.key.length - b.entry.key.length);
            return found.slice(0, limit).map(({ entry }) => entry.place);
        },
    };
};
