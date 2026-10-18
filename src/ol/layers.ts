import GeoJSON from 'ol/format/GeoJSON.js';
import MVT from 'ol/format/MVT.js';
import type BaseLayer from 'ol/layer/Base.js';
import ImageLayer from 'ol/layer/Image.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import type OlMap from 'ol/Map.js';
import ImageWMS from 'ol/source/ImageWMS.js';
import TileWMS from 'ol/source/TileWMS.js';
import VectorSource from 'ol/source/Vector.js';
import VectorTileSource from 'ol/source/VectorTile.js';
import XYZ from 'ol/source/XYZ.js';
import { createXYZ, extentFromProjection } from 'ol/tilegrid.js';
import type { LayerDescription, LayerSource } from '../catalog/describe.js';

export const ID_PROPERTY = 'urdimbre:id';

const common = (source: LayerSource): { attributions?: string; crossOrigin?: string | null } => {
    const options: { attributions?: string; crossOrigin?: string | null } = {};
    if (source.attribution !== undefined) options.attributions = source.attribution;
    if (source.crossOrigin !== undefined) options.crossOrigin = source.crossOrigin;
    return options;
};

const geoJsonSource = (map: OlMap, source: Extract<LayerSource, { type: 'geojson' }>): VectorSource => {
    const format = new GeoJSON();
    const options = source.attribution === undefined ? {} : { attributions: source.attribution };
    if (source.url !== undefined) return new VectorSource({ ...options, url: source.url, format });
    const features = format.readFeatures(source.data, { featureProjection: map.getView().getProjection() });
    return new VectorSource({ ...options, features });
};

export const createDefaultLayer = (map: OlMap, description: LayerDescription): BaseLayer | null => {
    const source = description.source;
    switch (source.type) {
        case 'wms-tiles': {
            const tileGrid = source.tileSize === 256 ? undefined : createXYZ({ extent: extentFromProjection(map.getView().getProjection()), tileSize: source.tileSize });
            const wms = new TileWMS({ ...common(source), url: source.url, params: { ...source.params }, hidpi: false, ...(tileGrid ? { tileGrid } : {}) });
            return new TileLayer({ source: wms });
        }
        case 'wms-image':
            return new ImageLayer({ source: new ImageWMS({ ...common(source), url: source.url, params: { ...source.params }, ratio: 1, hidpi: false }) });
        case 'xyz':
            return new TileLayer({ source: new XYZ({ ...common(source), url: source.url }) });
        case 'vector-tiles': {
            const options = source.attribution === undefined ? {} : { attributions: source.attribution };
            return new VectorTileLayer({ source: new VectorTileSource({ ...options, url: source.url, format: new MVT() }) });
        }
        case 'geojson':
            return new VectorLayer({ source: geoJsonSource(map, source) });
        case 'pmtiles':
            return null;
    }
};

const changedParams = (previous: Readonly<Record<string, string>>, next: Readonly<Record<string, string>>): Record<string, string | undefined> | null => {
    const changes: Record<string, string | undefined> = {};
    let count = 0;
    for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
        if (previous[key] === next[key]) continue;
        changes[key] = next[key];
        count += 1;
    }
    return count === 0 ? null : changes;
};

export const updateInPlace = (layer: BaseLayer, previous: LayerSource, next: LayerSource): boolean => {
    if (previous.crossOrigin !== next.crossOrigin || previous.attribution !== next.attribution) return false;
    if ((previous.type === 'wms-tiles' && next.type === 'wms-tiles' && previous.tileSize === next.tileSize)
        || (previous.type === 'wms-image' && next.type === 'wms-image')) {
        if (previous.url !== next.url) return false;
        const source = (layer as TileLayer<TileWMS> | ImageLayer<ImageWMS>).getSource();
        const changes = changedParams(previous.params, next.params);
        if (source && changes) source.updateParams(changes);
        return source !== null;
    }
    if (previous.type === 'xyz' && next.type === 'xyz') {
        const source = (layer as TileLayer<XYZ>).getSource();
        source?.setUrl(next.url);
        return source !== null;
    }
    return false;
};
