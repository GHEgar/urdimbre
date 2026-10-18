import { describe, expect, it, vi } from 'vitest';
import { createArbiter, IDENTIFY } from '../src/arbiter/index.js';
import type { MapPointer } from '../src/arbiter/index.js';

const pointer: MapPointer = { coordinate: [-103.35, 20.67], pixel: [10, 20], originalEvent: null };

describe('arbiter', () => {
    it('gives the click only to the tool that claimed it', () => {
        const arbiter = createArbiter();
        const measure = vi.fn();
        const draw = vi.fn();
        arbiter.claim('measure', { click: measure });
        expect(arbiter.click(pointer)).toBe(true);
        arbiter.claim('draw', { click: draw });
        arbiter.click(pointer);
        expect(measure).toHaveBeenCalledOnce();
        expect(draw).toHaveBeenCalledWith(pointer);
        expect(arbiter.active()).toBe('draw');
    });

    it('tells the previous tool with its escape', () => {
        const arbiter = createArbiter();
        const escape = vi.fn();
        arbiter.claim('measure', { escape });
        arbiter.claim('measure', {});
        expect(escape).not.toHaveBeenCalled();
        arbiter.claim('measure', { escape });
        arbiter.claim('draw', {});
        expect(escape).toHaveBeenCalledOnce();
    });

    it('sends the click to identify when no tool is active', () => {
        const arbiter = createArbiter();
        expect(arbiter.click(pointer)).toBe(false);
        const identify = vi.fn();
        const release = arbiter.claim(IDENTIFY, { click: identify });
        expect(arbiter.active()).toBeNull();
        expect(arbiter.click(pointer)).toBe(true);
        const stop = arbiter.claim('measure', {});
        expect(arbiter.click(pointer)).toBe(true);
        expect(identify).toHaveBeenCalledOnce();
        stop();
        arbiter.click(pointer);
        expect(identify).toHaveBeenCalledTimes(2);
        release();
        expect(arbiter.click(pointer)).toBe(false);
    });

    it('releases on Escape and through the returned function', () => {
        const arbiter = createArbiter();
        const escape = vi.fn();
        expect(arbiter.escape()).toBe(false);
        arbiter.claim('measure', { escape });
        expect(arbiter.escape()).toBe(true);
        expect(escape).toHaveBeenCalledOnce();
        expect(arbiter.active()).toBeNull();
        const release = arbiter.claim('draw', { escape });
        const other = arbiter.claim('pick', {});
        release();
        expect(arbiter.active()).toBe('pick');
        other();
        expect(arbiter.active()).toBeNull();
        expect(escape).toHaveBeenCalledTimes(2);
    });

    it('notifies with a stable snapshot', () => {
        const arbiter = createArbiter();
        const listener = vi.fn();
        arbiter.subscribe(listener);
        const empty = arbiter.getSnapshot();
        expect(empty).toEqual({ active: null });
        arbiter.claim('measure', {});
        arbiter.claim('measure', {});
        expect(listener).toHaveBeenCalledOnce();
        expect(arbiter.getSnapshot()).toEqual({ active: 'measure' });
        expect(arbiter.getSnapshot()).toBe(arbiter.getSnapshot());
    });

    it('hangs from an external Escape stack while a tool is active', () => {
        const stack: (() => boolean)[] = [];
        const onEscape = vi.fn((handler: () => boolean) => {
            stack.push(handler);
            return () => {
                stack.splice(stack.indexOf(handler), 1);
            };
        });
        const arbiter = createArbiter({ onEscape });
        expect(stack).toHaveLength(0);
        arbiter.claim('measure', {});
        arbiter.claim('draw', {});
        expect(onEscape).toHaveBeenCalledOnce();
        expect(stack.at(-1)?.()).toBe(true);
        expect(arbiter.active()).toBeNull();
        expect(stack).toHaveLength(0);
    });
});
