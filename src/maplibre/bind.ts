import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { LayerDescription } from '../catalog/describe.js';
import type { DescriptionSource } from '../catalog/observe.js';
import { defaultTemplates, layerSpecs, opacityPaint, PREFIX, sourceSpec, tileUrls } from './specs.js';
import type { LayerTemplate } from './specs.js';

export type MapLibreEventName = 'click' | 'load' | 'style.load' | 'styledata' | 'idle';

export interface MapLibreMapLike {
    addSource(id: string, source: SourceSpecification): unknown;
    getSource(id: string): unknown;
    removeSource(id: string): unknown;
    addLayer(layer: LayerSpecification, beforeId?: string): unknown;
    removeLayer(id: string): unknown;
    getLayer(id: string): unknown;
    moveLayer(id: string, beforeId?: string): unknown;
    setPaintProperty(layerId: string, name: string, value: unknown): unknown;
    setLayoutProperty(layerId: string, name: string, value: unknown): unknown;
    on(type: MapLibreEventName, listener: (event: unknown) => void): unknown;
    off(type: MapLibreEventName, listener: (event: unknown) => void): unknown;
    isStyleLoaded?(): unknown;
}

export interface BindMapLibreOptions {
    layers?(description: LayerDescription): readonly LayerTemplate[] | null | undefined;
    beforeId?: string;
}

interface Entry {
    description: LayerDescription;
    sourceId: string;
    templates: readonly LayerTemplate[];
    layers: LayerSpecification[];
}

interface LiveSource {
    setTiles?(tiles: string[]): unknown;
    setData?(data: unknown): unknown;
}

const sameZoom = (a: LayerDescription, b: LayerDescription): boolean => a.minZoom === b.minZoom && a.maxZoom === b.maxZoom;

export const bindMapLibre = (map: MapLibreMapLike, input: DescriptionSource, options: BindMapLibreOptions = {}): () => void => {
    const entries = new Map<string, Entry>();
    let order: string[] = [];
    const styleReady = (): boolean => !map.isStyleLoaded || map.isStyleLoaded() === true;
    let ready = styleReady();
    let pending = !ready;

    const add = (description: LayerDescription): Entry => {
        const sourceId = `${PREFIX}${description.id}`;
        const templates = options.layers?.(description) ?? defaultTemplates(description);
        const layers = layerSpecs(description, templates, sourceId);
        map.addSource(sourceId, sourceSpec(description.source));
        order = [];
        for (const layer of layers) map.addLayer(layer, options.beforeId !== undefined && map.getLayer(options.beforeId) ? options.beforeId : undefined);
        return { description, sourceId, templates, layers };
    };

    const drop = (entry: Entry): void => {
        for (const layer of entry.layers) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
        if (map.getSource(entry.sourceId)) map.removeSource(entry.sourceId);
    };

    const updateSource = (entry: Entry, next: LayerDescription): boolean => {
        const previous = entry.description.source;
        const source = map.getSource(entry.sourceId) as LiveSource | undefined;
        if (!source || previous.type !== next.source.type || previous.attribution !== next.source.attribution) return false;
        const tiles = tileUrls(next.source);
        if (tiles && source.setTiles && (previous.type !== 'wms-tiles' || next.source.type !== 'wms-tiles' || previous.tileSize === next.source.tileSize)) {
            source.setTiles(tiles);
            return true;
        }
        if (next.source.type === 'geojson' && source.setData) {
            source.setData(next.source.data ?? next.source.url);
            return true;
        }
        return false;
    };

    const applyProps = (entry: Entry, next: LayerDescription): void => {
        const previous = entry.description;
        entry.layers.forEach((layer, index) => {
            const template = entry.templates[index] as LayerTemplate;
            if (previous.visible !== next.visible) map.setLayoutProperty(layer.id, 'visibility', next.visible ? 'visible' : 'none');
            if (previous.opacity === next.opacity) return;
            for (const [name, value] of Object.entries(opacityPaint(template, next.opacity))) map.setPaintProperty(layer.id, name, value);
        });
    };

    const reorder = (): void => {
        const wanted = [...entries.values()]
            .sort((a, b) => a.description.zIndex - b.description.zIndex)
            .flatMap(entry => entry.layers.map(layer => layer.id));
        if (wanted.length === order.length && wanted.every((id, index) => id === order[index])) return;
        let above = options.beforeId !== undefined && map.getLayer(options.beforeId) ? options.beforeId : undefined;
        for (const id of [...wanted].reverse()) {
            map.moveLayer(id, above);
            above = id;
        }
        order = wanted;
    };

    const apply = (): void => {
        const seen = new Set<string>();
        for (const description of input.getDescriptions()) {
            seen.add(description.id);
            const entry = entries.get(description.id);
            if (!entry) {
                entries.set(description.id, add(description));
                continue;
            }
            if (entry.description.key !== description.key || !sameZoom(entry.description, description)) {
                if (!sameZoom(entry.description, description) || !updateSource(entry, description)) {
                    drop(entry);
                    entries.set(description.id, add(description));
                    continue;
                }
            }
            applyProps(entry, description);
            entry.description = description;
        }
        for (const [id, entry] of entries) {
            if (seen.has(id)) continue;
            drop(entry);
            entries.delete(id);
        }
        reorder();
    };

    const sync = (): void => {
        if (!ready) {
            pending = true;
            return;
        }
        pending = false;
        try {
            apply();
        } catch (error) {
            if (styleReady()) throw error;
            ready = false;
            pending = true;
        }
    };

    const refresh = (force: boolean): void => {
        if (!ready && !(force || styleReady())) return;
        ready = true;
        let lost = false;
        for (const [id, entry] of entries) {
            if (map.getSource(entry.sourceId)) continue;
            entries.delete(id);
            lost = true;
        }
        if (lost) order = [];
        if (lost || pending) sync();
    };

    const onLoad = (): void => refresh(true);
    const onData = (): void => refresh(false);
    map.on('style.load', onLoad);
    map.on('load', onLoad);
    map.on('styledata', onData);
    map.on('idle', onData);
    sync();
    const unsubscribe = input.subscribe(sync);
    return () => {
        unsubscribe();
        map.off('style.load', onLoad);
        map.off('load', onLoad);
        map.off('styledata', onData);
        map.off('idle', onData);
        if (ready) for (const entry of entries.values()) drop(entry);
        entries.clear();
    };
};
