export interface MapPointer {
    coordinate: readonly [number, number];
    pixel: readonly [number, number];
    originalEvent: unknown;
}

export interface ToolHandlers {
    click?(e: MapPointer): void;
    escape?(): void;
}

export interface ArbiterSnapshot {
    active: string | null;
}

export interface Arbiter {
    claim(tool: string, handlers: ToolHandlers): () => void;
    active(): string | null;
    click(e: MapPointer): boolean;
    escape(): boolean;
    subscribe(listener: () => void): () => void;
    getSnapshot(): ArbiterSnapshot;
}

export interface ArbiterOptions {
    onEscape?: (handler: () => boolean) => () => void;
}

export const IDENTIFY = 'identify';

export const createArbiter = (options: ArbiterOptions = {}): Arbiter => {
    const listeners = new Set<() => void>();
    let current: { tool: string; handlers: ToolHandlers } | null = null;
    let identify: ToolHandlers | null = null;
    let snapshot: ArbiterSnapshot = Object.freeze({ active: null });
    let releaseEscape: (() => void) | null = null;

    const arbiter: Arbiter = {
        claim(tool, handlers) {
            if (tool === IDENTIFY) {
                const own = handlers;
                identify = own;
                return () => {
                    if (identify === own) identify = null;
                };
            }
            const previous = current;
            const own = { tool, handlers };
            current = own;
            if (previous && previous.tool !== tool) previous.handlers.escape?.();
            update();
            return () => {
                if (current !== own) return;
                current = null;
                update();
            };
        },
        active: () => current?.tool ?? null,
        click(e) {
            if (current) {
                current.handlers.click?.(e);
                return true;
            }
            if (!identify?.click) return false;
            identify.click(e);
            return true;
        },
        escape() {
            const previous = current;
            if (!previous) return false;
            current = null;
            update();
            previous.handlers.escape?.();
            return true;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getSnapshot: () => snapshot,
    };

    function update(): void {
        const active = current?.tool ?? null;
        if (active !== null && releaseEscape === null && options.onEscape) releaseEscape = options.onEscape(() => arbiter.escape());
        if (active === null && releaseEscape !== null) {
            releaseEscape();
            releaseEscape = null;
        }
        if (snapshot.active === active) return;
        snapshot = Object.freeze({ active });
        for (const listener of [...listeners]) listener();
    }

    return arbiter;
};
