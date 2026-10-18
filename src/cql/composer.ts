import { and } from './logic.js';

export interface CqlSnapshot {
    fragments: Readonly<Record<string, string>>;
    cql: string | null;
}

export interface CqlComposer {
    set(name: string, fragment: string | null | undefined): void;
    get(name: string): string | null;
    names(): string[];
    compose(): string | null;
    subscribe(listener: () => void): () => void;
    getSnapshot(): CqlSnapshot;
}

export interface CqlComposerOptions {
    order?: readonly string[];
}

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const createCqlComposer = (options: CqlComposerOptions = {}): CqlComposer => {
    const rank = new Map((options.order ?? []).map((name, index) => [name, index]));
    const fragments = new Map<string, string>();
    const listeners = new Set<() => void>();

    const ordered = (): string[] => [...fragments.keys()].sort((a, b) => {
        const left = rank.get(a);
        const right = rank.get(b);
        if (left !== undefined && right !== undefined) return left - right;
        if (left !== undefined) return -1;
        if (right !== undefined) return 1;
        return byName(a, b);
    });

    const build = (): CqlSnapshot => {
        const names = ordered();
        const record: Record<string, string> = {};
        for (const name of names) record[name] = fragments.get(name) as string;
        return Object.freeze({ fragments: Object.freeze(record), cql: and(...Object.values(record)) });
    };

    let snapshot = build();

    return {
        set(name, fragment) {
            const next = fragment?.trim() || null;
            const current = fragments.get(name) ?? null;
            if (next === current) return;
            if (next === null) fragments.delete(name);
            else fragments.set(name, next);
            snapshot = build();
            for (const listener of [...listeners]) listener();
        },
        get: name => fragments.get(name) ?? null,
        names: () => Object.keys(snapshot.fragments),
        compose: () => snapshot.cql,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getSnapshot: () => snapshot,
    };
};
