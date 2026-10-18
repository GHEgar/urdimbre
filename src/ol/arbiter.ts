import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import type OlMap from 'ol/Map.js';
import { unByKey } from 'ol/Observable.js';
import { toLonLat } from 'ol/proj.js';
import type { Arbiter } from '../arbiter/arbiter.js';

export const bindArbiter = (map: OlMap, arbiter: Arbiter): () => void => {
    const key = map.on('singleclick', (event: MapBrowserEvent) => {
        const [lon, lat] = toLonLat(event.coordinate, map.getView().getProjection());
        const [x, y] = event.pixel;
        arbiter.click({ coordinate: [lon as number, lat as number], pixel: [x as number, y as number], originalEvent: event.originalEvent });
    });
    return () => unByKey(key);
};
