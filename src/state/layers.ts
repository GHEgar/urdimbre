import { defaultOpacities, defaultOpacity, INITIAL_CQL_FRAGMENT } from '../catalog/state.js';
import type { LayerState, LayerStateSnapshot } from '../catalog/state.js';
import type { CqlFragments, PortalState } from './types.js';

export const readLayerState = (state: LayerState): Pick<PortalState, 'layers' | 'fragments'> => {
    const layers = state.getSnapshot();
    const fragments: Record<string, Readonly<Record<string, string>>> = {};
    for (const id of Object.keys(layers.cql)) fragments[id] = state.composer(id).getSnapshot().fragments;
    return { layers, fragments };
};

const keys = (...records: Readonly<Record<string, unknown>>[]): string[] => [...new Set(records.flatMap(record => Object.keys(record)))];

const targetFragments = (id: string, layers: LayerStateSnapshot, fragments: CqlFragments | undefined): Readonly<Record<string, string>> => {
    const declared = fragments?.[id];
    if (declared) return declared;
    const cql = layers.cql[id];
    return cql ? { [INITIAL_CQL_FRAGMENT]: cql } : {};
};

export const applyLayerState = (state: LayerState, partial: Pick<Partial<PortalState>, 'layers' | 'fragments'>): void => {
    const target = partial.layers;
    if (!target) return;
    const current = state.getSnapshot();
    for (const id of current.active) {
        if (!target.active.includes(id)) state.remove(id);
    }
    target.active.forEach((id, index) => state.add(id, index));
    for (const id of keys(current.opacity, target.opacity, defaultOpacities(state))) {
        state.setOpacity(id, target.opacity[id] ?? (target.active.includes(id) ? 1 : defaultOpacity(state, id)));
    }
    for (const id of keys(current.visible, target.visible)) state.setVisible(id, target.visible[id] ?? true);
    for (const id of keys(current.dimensions, target.dimensions)) {
        const wanted = target.dimensions[id] ?? {};
        for (const name of keys(current.dimensions[id] ?? {}, wanted)) state.setDimension(id, name, wanted[name] ?? null);
    }
    for (const id of keys(current.cql, target.cql, partial.fragments ?? {})) {
        const composer = state.composer(id);
        const wanted = targetFragments(id, target, partial.fragments);
        for (const name of composer.names()) {
            if (!(name in wanted)) composer.set(name, null);
        }
        for (const [name, fragment] of Object.entries(wanted)) composer.set(name, fragment);
    }
};
