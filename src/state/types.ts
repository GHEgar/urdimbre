import type { LayerStateSnapshot } from '../catalog/state.js';

export interface ViewState {
    center: [number, number];
    zoom: number;
    bearing: number;
    pitch: number;
}

export type CqlFragments = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface PortalState {
    view: ViewState;
    layers: LayerStateSnapshot;
    fragments?: CqlFragments;
    tool?: string | null;
    extra?: Readonly<Record<string, string>>;
}

export const VIEW_KEY = 'v';
export const LAYERS_KEY = 'l';
export const FRAGMENTS_KEY = 'f';
export const TOOL_KEY = 't';
export const RESERVED_KEYS: readonly string[] = [VIEW_KEY, LAYERS_KEY, FRAGMENTS_KEY, TOOL_KEY];
