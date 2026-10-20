export type Coordinate = readonly [number, number];

export interface Place {
    name: string;
    kind: string;
    coordinate: Coordinate;
    detail?: string;
    bbox?: readonly [number, number, number, number];
    zoom?: number;
    source?: string;
}

export interface SearchOptions {
    limit?: number;
    near?: Coordinate;
}
