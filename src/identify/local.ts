import type { Feature } from '../ogc/types.js';

type Pixel = [number, number];

export interface HitPoint {
    coordinate: readonly [number, number];
    resolution: number;
    crs?: string;
}

const RADIUS = 6378137;
const MAX_LAT = 85.0511287798;
const MERCATOR = new Set(['EPSG:3857', 'EPSG:900913', 'EPSG:102100']);
const GEOGRAPHIC = new Set(['EPSG:4326', 'CRS:84', 'OGC:CRS84']);

type Projection = (lon: number, lat: number) => Pixel;

const mercator: Projection = (lon, lat) => {
    const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
    return [RADIUS * lon * Math.PI / 180, RADIUS * Math.log(Math.tan(Math.PI / 4 + clamped * Math.PI / 360))];
};

const geographic: Projection = (lon, lat) => [lon, lat];

export const projectionFor = (crs: string | undefined): Projection | null => {
    const code = (crs ?? 'EPSG:3857').toUpperCase();
    if (MERCATOR.has(code)) return mercator;
    if (GEOGRAPHIC.has(code)) return geographic;
    return null;
};

const isPosition = (value: unknown): value is [number, number] =>
    Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number';

const segment = (a: Pixel, b: Pixel): number => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / length));
    return Math.hypot(a[0] + t * dx, a[1] + t * dy);
};

const nearLine = (line: readonly Pixel[], tolerance: number): boolean => {
    if (line.length === 1) return Math.hypot(...(line[0] as Pixel)) <= tolerance;
    return line.slice(1).some((point, index) => segment(line[index] as Pixel, point) <= tolerance);
};

const crossings = (ring: readonly Pixel[]): number => {
    let count = 0;
    ring.forEach((a, index) => {
        const b = ring[(index + 1) % ring.length] as Pixel;
        if ((a[1] > 0) !== (b[1] > 0) && a[0] + (0 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]) > 0) count += 1;
    });
    return count;
};

const inPolygon = (rings: readonly Pixel[][], tolerance: number): boolean =>
    rings.reduce((sum, ring) => sum + crossings(ring), 0) % 2 === 1 || rings.some(ring => nearLine(ring, tolerance));

const hits = (geometry: unknown, toPixel: (position: [number, number]) => Pixel, tolerance: number): boolean => {
    if (typeof geometry !== 'object' || geometry === null) return false;
    const { type, coordinates, geometries } = geometry as { type?: unknown; coordinates?: unknown; geometries?: unknown };
    const line = (value: unknown): Pixel[] => (Array.isArray(value) ? value.filter(isPosition).map(toPixel) : []);
    const lines = (value: unknown): Pixel[][] => (Array.isArray(value) ? value.map(line) : []);
    switch (type) {
        case 'Point':
            return isPosition(coordinates) && Math.hypot(...toPixel(coordinates)) <= tolerance;
        case 'MultiPoint':
            return line(coordinates).some(point => Math.hypot(...point) <= tolerance);
        case 'LineString':
            return nearLine(line(coordinates), tolerance);
        case 'MultiLineString':
            return lines(coordinates).some(item => nearLine(item, tolerance));
        case 'Polygon':
            return inPolygon(lines(coordinates), tolerance);
        case 'MultiPolygon':
            return Array.isArray(coordinates) && coordinates.some(polygon => inPolygon(lines(polygon), tolerance));
        case 'GeometryCollection':
            return Array.isArray(geometries) && geometries.some(item => hits(item, toPixel, tolerance));
        default:
            return false;
    }
};

const featuresOf = (data: unknown): Feature[] => {
    if (typeof data !== 'object' || data === null) return [];
    const value = data as { type?: unknown; features?: unknown };
    if (value.type === 'FeatureCollection' && Array.isArray(value.features)) return value.features as Feature[];
    if (value.type === 'Feature') return [data as Feature];
    return [{ type: 'Feature', geometry: data, properties: null }];
};

export const hitFeatures = (data: unknown, at: HitPoint, tolerance: number): Feature[] | null => {
    const project = projectionFor(at.crs);
    if (!project || !(at.resolution > 0)) return null;
    const [cx, cy] = project(at.coordinate[0], at.coordinate[1]);
    const toPixel = ([lon, lat]: [number, number]): Pixel => {
        const [x, y] = project(lon, lat);
        return [(x - cx) / at.resolution, (cy - y) / at.resolution];
    };
    return featuresOf(data).filter(feature => hits(feature.geometry, toPixel, tolerance)).reverse();
};
