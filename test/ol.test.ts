import OlMap from 'ol/Map.js';
import MapBrowserEvent from 'ol/MapBrowserEvent.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import { fromLonLat } from 'ol/proj.js';
import ImageWMS from 'ol/source/ImageWMS.js';
import OSM from 'ol/source/OSM.js';
import TileWMS from 'ol/source/TileWMS.js';
import XYZ from 'ol/source/XYZ.js';
import View from 'ol/View.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArbiter } from '../src/arbiter/index.js';
import { createLayerState, defineCatalog, describeState } from '../src/catalog/index.js';
import { bindArbiter, bindOl, ID_PROPERTY } from '../src/ol/index.js';
import { catalogInput } from './layers.js';

const catalog = defineCatalog(catalogInput());

const setup = (active: string[]) => {
    const map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
    const state = createLayerState(catalog, { active });
    const stop = bindOl(map, describeState(catalog, state));
    const own = () => map.getLayers().getArray().filter(layer => layer.get(ID_PROPERTY));
    const byId = (id: string) => own().find(layer => layer.get(ID_PROPERTY) === id);
    return { map, state, stop, own, byId };
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('bindOl', () => {
    it('creates one layer and one source per logical layer', () => {
        const { own, byId } = setup(['states', 'elevation', 'osm', 'roads', 'points', 'wfs-states']);
        expect(own().map(layer => layer.get(ID_PROPERTY))).toEqual(['states', 'elevation', 'osm', 'roads', 'points', 'wfs-states']);
        const states = byId('states') as TileLayer<TileWMS>;
        expect(states.getSource()).toBeInstanceOf(TileWMS);
        expect(states.getSource()?.getParams()).toMatchObject({ LAYERS: 'topp:states', TILED: 'true', STYLES: 'polygon' });
        expect(states.getZIndex()).toBe(160);
        expect((byId('elevation') as TileLayer<never>).getSource()).toBeInstanceOf(ImageWMS);
        expect((byId('osm') as TileLayer<XYZ>).getSource()).toBeInstanceOf(XYZ);
        expect(byId('osm')?.getMaxZoom()).toBe(19);
        expect((byId('points') as VectorLayer).getSource()?.getFeatures()).toHaveLength(1);
    });

    it('changes only the opacity without recreating the source', () => {
        const { state, byId } = setup(['states']);
        const layer = byId('states') as TileLayer<TileWMS>;
        const source = layer.getSource();
        const update = vi.spyOn(TileWMS.prototype, 'updateParams');
        state.setOpacity('states', 0.3);
        state.setVisible('states', false);
        expect(byId('states')).toBe(layer);
        expect(layer.getSource()).toBe(source);
        expect(layer.getOpacity()).toBe(0.3);
        expect(layer.getVisible()).toBe(false);
        expect(update).not.toHaveBeenCalled();
    });

    it('updates only the changed parameters when the CQL changes', () => {
        const { state, byId } = setup(['states']);
        const layer = byId('states') as TileLayer<TileWMS>;
        const source = layer.getSource();
        const update = vi.spyOn(TileWMS.prototype, 'updateParams');
        state.composer('states').set('table', 'PERSONS > 1');
        expect(update).toHaveBeenCalledExactlyOnceWith({ CQL_FILTER: 'PERSONS > 1' });
        expect(layer.getSource()).toBe(source);
        state.composer('states').set('table', null);
        expect(update).toHaveBeenLastCalledWith({ CQL_FILTER: undefined });
        expect(byId('states')).toBe(layer);
        expect(layer.getSource()).toBe(source);
    });

    it('sends a new TIME through updateParams', () => {
        const { state, byId } = setup(['storms']);
        const source = (byId('storms') as TileLayer<TileWMS>).getSource();
        state.setDimension('storms', 'time', '1990-07-23T00:00:00.000Z');
        expect(source?.getParams().TIME).toBe('1990-07-23T00:00:00.000Z');
        expect(source?.getParams().CQL_FILTER).toBeUndefined();
    });

    it('reorders with zIndex and removes layers that leave', () => {
        const { state, byId, own } = setup(['states', 'osm']);
        state.move('osm', 0);
        expect(byId('osm')?.getZIndex()).toBe(120);
        expect(byId('states')?.getZIndex()).toBe(110);
        state.remove('states');
        expect(own().map(layer => layer.get(ID_PROPERTY))).toEqual(['osm']);
    });

    it('leaves foreign layers alone and cleans up on dispose', () => {
        const map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
        const base = new TileLayer({ source: new OSM() });
        map.addLayer(base);
        const state = createLayerState(catalog, { active: ['states', 'osm'] });
        const stop = bindOl(map, describeState(catalog, state));
        expect(map.getLayers().getLength()).toBe(3);
        state.remove('states');
        state.remove('osm');
        expect(map.getLayers().getArray()).toEqual([base]);
        state.add('osm');
        stop();
        state.add('states');
        expect(map.getLayers().getArray()).toEqual([base]);
    });

    it('uses a custom layer factory and skips PMTiles without one', () => {
        const map = new OlMap({ view: new View() });
        const state = createLayerState(catalog, { active: ['parcels', 'osm'] });
        bindOl(map, describeState(catalog, state));
        expect(map.getLayers().getArray().map(layer => layer.get(ID_PROPERTY))).toEqual(['osm']);
        const custom = new VectorLayer();
        const other = new OlMap({ view: new View() });
        bindOl(other, describeState(catalog, state), { createLayer: description => (description.kind === 'pmtiles' ? custom : null) });
        expect(other.getLayers().getArray()).toContain(custom);
        expect(custom.get(ID_PROPERTY)).toBe('parcels');
    });
});

describe('bindArbiter for OpenLayers', () => {
    it('turns singleclick into a pointer in longitude and latitude', () => {
        const map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
        const arbiter = createArbiter();
        const click = vi.fn();
        arbiter.claim('measure', { click });
        const stop = bindArbiter(map, arbiter);
        const original = new PointerEvent('pointerup');
        const event = new MapBrowserEvent('singleclick', map, original);
        event.pixel = [12, 34];
        event.coordinate = fromLonLat([-103.35, 20.67]);
        map.dispatchEvent(event);
        expect(click).toHaveBeenCalledOnce();
        const pointer = click.mock.calls[0]?.[0];
        expect(pointer.coordinate[0]).toBeCloseTo(-103.35, 6);
        expect(pointer.coordinate[1]).toBeCloseTo(20.67, 6);
        expect(pointer.pixel).toEqual([12, 34]);
        expect(pointer.originalEvent).toBe(original);
        stop();
        map.dispatchEvent(event);
        expect(click).toHaveBeenCalledOnce();
    });
});

describe('bindOl refresh', () => {
    it('rebuilds a layer in its place and leaves the others', () => {
        const map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
        const state = createLayerState(catalog, { active: ['states', 'osm'] });
        const createLayer = vi.fn(() => null);
        const binding = bindOl(map, describeState(catalog, state), { createLayer });
        const layers = () => map.getLayers().getArray();
        const [states, osm] = layers();
        createLayer.mockClear();
        binding.refresh('osm');
        expect(createLayer).toHaveBeenCalledTimes(1);
        expect(layers()[0]).toBe(states);
        expect(layers()[1]).not.toBe(osm);
        expect(layers()[1]?.get(ID_PROPERTY)).toBe('osm');
        expect(layers()[1]?.getZIndex()).toBe(osm?.getZIndex());
        binding.refresh('parcels');
        expect(createLayer).toHaveBeenCalledTimes(1);
        binding.refresh();
        expect(createLayer).toHaveBeenCalledTimes(3);
        binding();
        expect(layers()).toEqual([]);
    });
});
