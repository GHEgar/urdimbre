import type BaseLayer from 'ol/layer/Base.js';
import type OlMap from 'ol/Map.js';
import type { LayerDescription } from '../catalog/describe.js';
import type { DescriptionSource } from '../catalog/observe.js';
import { createDefaultLayer, ID_PROPERTY, updateInPlace } from './layers.js';

export interface BindOlOptions {
    createLayer?(description: LayerDescription, map: OlMap): BaseLayer | null | undefined;
}

interface Entry {
    layer: BaseLayer;
    description: LayerDescription;
    custom: boolean;
}

const applyProps = (layer: BaseLayer, description: LayerDescription): void => {
    if (layer.getOpacity() !== description.opacity) layer.setOpacity(description.opacity);
    if (layer.getVisible() !== description.visible) layer.setVisible(description.visible);
    if (layer.getZIndex() !== description.zIndex) layer.setZIndex(description.zIndex);
    const minZoom = description.minZoom ?? -Infinity;
    const maxZoom = description.maxZoom ?? Infinity;
    if (layer.getMinZoom() !== minZoom) layer.setMinZoom(minZoom);
    if (layer.getMaxZoom() !== maxZoom) layer.setMaxZoom(maxZoom);
};

export const bindOl = (map: OlMap, input: DescriptionSource, options: BindOlOptions = {}): () => void => {
    const entries = new Map<string, Entry>();

    const build = (description: LayerDescription): Omit<Entry, 'description'> | null => {
        const custom = options.createLayer?.(description, map) ?? null;
        const layer = custom ?? createDefaultLayer(map, description);
        if (!layer) return null;
        layer.set(ID_PROPERTY, description.id);
        return { layer, custom: custom !== null };
    };

    const replace = (entry: Entry, description: LayerDescription): void => {
        const built = build(description);
        const layers = map.getLayers();
        const at = layers.getArray().indexOf(entry.layer);
        if (!built) {
            map.removeLayer(entry.layer);
            entries.delete(description.id);
            return;
        }
        if (at < 0) map.addLayer(built.layer);
        else layers.setAt(at, built.layer);
        entry.layer = built.layer;
        entry.custom = built.custom;
    };

    const sync = (): void => {
        const descriptions = input.getDescriptions();
        const seen = new Set<string>();
        for (const description of descriptions) {
            seen.add(description.id);
            const entry = entries.get(description.id);
            if (!entry) {
                const built = build(description);
                if (!built) continue;
                applyProps(built.layer, description);
                map.addLayer(built.layer);
                entries.set(description.id, { ...built, description });
                continue;
            }
            if (entry.description.key !== description.key
                && (entry.custom || !updateInPlace(entry.layer, entry.description.source, description.source))) {
                replace(entry, description);
                if (!entries.has(description.id)) continue;
            }
            applyProps(entry.layer, description);
            entry.description = description;
        }
        for (const [id, entry] of entries) {
            if (seen.has(id)) continue;
            map.removeLayer(entry.layer);
            entries.delete(id);
        }
    };

    sync();
    const unsubscribe = input.subscribe(sync);
    return () => {
        unsubscribe();
        for (const entry of entries.values()) map.removeLayer(entry.layer);
        entries.clear();
    };
};
