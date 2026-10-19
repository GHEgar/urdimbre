export type SymbolShape = 'point' | 'line' | 'fill';

export interface LegendClass {
    label: string;
    color: string;
    min?: number;
    max?: number;
    count?: number;
}

export interface LegendStop {
    value: number;
    color: string;
}

export interface LegendSymbol {
    label: string;
    color: string;
    shape: SymbolShape;
}

export type LegendEntry =
    | { kind: 'classes'; layerId: string; title: string; classes: LegendClass[] }
    | { kind: 'ramp'; layerId: string; title: string; stops: LegendStop[] }
    | { kind: 'image'; layerId: string; title: string; url: string }
    | { kind: 'symbols'; layerId: string; title: string; items: LegendSymbol[] };
