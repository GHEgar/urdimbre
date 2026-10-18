import type { MapMouseEvent } from 'maplibre-gl';
import type { Arbiter } from '../arbiter/arbiter.js';
import type { MapLibreMapLike } from './bind.js';

export type MapLibreClick = Pick<MapMouseEvent, 'lngLat' | 'point' | 'originalEvent'>;

export const bindArbiter = (map: Pick<MapLibreMapLike, 'on' | 'off'>, arbiter: Arbiter): () => void => {
    const listener = (input: unknown): void => {
        const event = input as MapLibreClick;
        arbiter.click({ coordinate: [event.lngLat.lng, event.lngLat.lat], pixel: [event.point.x, event.point.y], originalEvent: event.originalEvent });
    };
    map.on('click', listener);
    return () => {
        map.off('click', listener);
    };
};
