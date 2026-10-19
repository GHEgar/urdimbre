import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { MapLibreEventName, MapLibreMapLike } from '../src/maplibre/index.js';

export interface DoubleOptions {
    live?: boolean;
    loaded?: boolean;
    ordered?: boolean;
}

export const createDouble = (options: DoubleOptions = {}) => {
    const calls: [string, ...unknown[]][] = [];
    const sources = new Map<string, SourceSpecification & { setTiles?(tiles: string[]): void; setData?(data: unknown): void }>();
    const layers: LayerSpecification[] = [];
    const handlers = new Map<string, Set<(event: unknown) => void>>();
    let loaded = options.loaded ?? true;
    const index = (id: string): number => layers.findIndex(layer => layer.id === id);
    const map: MapLibreMapLike = {
        addSource(id, source) {
            calls.push(['addSource', id, source]);
            if (sources.has(id)) throw new Error(`Source ${id} exists`);
            if (!loaded) throw new Error('Style is not done loading');
            const live = { ...source } as SourceSpecification & { setTiles?(tiles: string[]): void; setData?(data: unknown): void };
            if (options.live) {
                live.setTiles = (tiles) => {
                    calls.push(['setTiles', id, tiles]);
                    (live as { tiles?: string[] }).tiles = tiles;
                };
                live.setData = data => calls.push(['setData', id, data]);
            }
            sources.set(id, live);
        },
        getSource: id => sources.get(id),
        removeSource(id) {
            calls.push(['removeSource', id]);
            if (layers.some(layer => 'source' in layer && layer.source === id)) throw new Error(`Source ${id} in use`);
            sources.delete(id);
        },
        addLayer(layer, beforeId) {
            calls.push(['addLayer', layer, beforeId]);
            const at = beforeId === undefined ? -1 : index(beforeId);
            if (at < 0) layers.push(layer);
            else layers.splice(at, 0, layer);
        },
        removeLayer(id) {
            calls.push(['removeLayer', id]);
            layers.splice(index(id), 1);
        },
        getLayer: id => layers.find(layer => layer.id === id),
        moveLayer(id, beforeId) {
            calls.push(['moveLayer', id, beforeId]);
            const [layer] = layers.splice(index(id), 1);
            const at = beforeId === undefined ? -1 : index(beforeId);
            if (at < 0) layers.push(layer as LayerSpecification);
            else layers.splice(at, 0, layer as LayerSpecification);
        },
        setPaintProperty: (...args) => calls.push(['setPaintProperty', ...args]),
        setLayoutProperty: (...args) => calls.push(['setLayoutProperty', ...args]),
        on(type, listener) {
            handlers.set(type, (handlers.get(type) ?? new Set()).add(listener));
        },
        off(type, listener) {
            handlers.get(type)?.delete(listener);
        },
        isStyleLoaded: () => loaded,
    };
    if (options.ordered !== false) map.getLayersOrder = () => layers.map(layer => layer.id);
    const fire = (type: MapLibreEventName, event: unknown = {}): void => {
        for (const listener of handlers.get(type) ?? []) listener(event);
    };
    const setLoaded = (value: boolean): void => {
        loaded = value;
    };
    const named = (name: string) => calls.filter(call => call[0] === name);
    const resetStyle = (): void => {
        sources.clear();
        layers.splice(0, layers.length, ...layers.filter(layer => !layer.id.startsWith('urdimbre:')));
    };
    return { map, calls, sources, layers, handlers, fire, setLoaded, named, resetStyle };
};
