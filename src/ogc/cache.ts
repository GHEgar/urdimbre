interface Entry {
    promise: Promise<unknown>;
    controller: AbortController;
    waiters: number;
    settled: boolean;
    expires: number;
}

export interface RequestCache {
    get<T>(key: string, run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T>;
    clear(): void;
}

const abortReason = (signal: AbortSignal): unknown =>
    signal.reason ?? new DOMException('The operation was aborted', 'AbortError');

export const createRequestCache = (ttl: number): RequestCache => {
    const entries = new Map<string, Entry>();

    const drop = (key: string, entry: Entry): void => {
        if (entries.get(key) === entry) entries.delete(key);
    };

    const start = (key: string, run: (signal: AbortSignal) => Promise<unknown>): Entry => {
        const controller = new AbortController();
        const entry: Entry = { promise: Promise.resolve(), controller, waiters: 0, settled: false, expires: Infinity };
        entry.promise = run(controller.signal);
        entry.promise.then(() => {
            entry.settled = true;
            entry.expires = Date.now() + ttl;
            if (ttl <= 0) drop(key, entry);
        }, () => {
            entry.settled = true;
            drop(key, entry);
        });
        entries.set(key, entry);
        return entry;
    };

    const follow = <T>(key: string, entry: Entry, signal: AbortSignal | undefined): Promise<T> => new Promise<T>((resolve, reject) => {
        let done = false;
        entry.waiters += 1;
        const leave = (): boolean => {
            if (done) return false;
            done = true;
            entry.waiters -= 1;
            signal?.removeEventListener('abort', abort);
            return true;
        };
        function abort(): void {
            if (!signal || !leave()) return;
            reject(abortReason(signal));
            if (entry.waiters === 0 && !entry.settled) {
                drop(key, entry);
                entry.controller.abort(abortReason(signal));
            }
        }
        signal?.addEventListener('abort', abort, { once: true });
        entry.promise.then(value => {
            if (leave()) resolve(value as T);
        }, (error: unknown) => {
            if (leave()) reject(error);
        });
    });

    return {
        get<T>(key: string, run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
            if (signal?.aborted) return Promise.reject(abortReason(signal));
            let entry = entries.get(key);
            if (entry?.settled && entry.expires <= Date.now()) {
                drop(key, entry);
                entry = undefined;
            }
            if (!entry) entry = start(key, run);
            if (entry.settled) return entry.promise as Promise<T>;
            return follow<T>(key, entry, signal);
        },
        clear() {
            entries.clear();
        },
    };
};
