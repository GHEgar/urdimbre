import { OgcError } from './errors.js';
import type { Extent, WmsBoundingBox, WmsCapabilities, WmsDimension, WmsLayer, WmsStyle } from './types.js';
import { attribute, childElement, childElements, childText, parseXml } from './xml.js';

interface Inherited {
    queryable: boolean;
    crs: string[];
    geographicBbox: Extent | null;
    bbox: WmsBoundingBox[];
    styles: WmsStyle[];
    dimensions: WmsDimension[];
}

const ROOT: Inherited = { queryable: false, crs: [], geographicBbox: null, bbox: [], styles: [], dimensions: [] };

const number = (text: string | null): number => {
    const value = Number(text);
    if (text === null || !Number.isFinite(value)) throw new OgcError(`Invalid coordinate in capabilities: ${text}`);
    return value;
};

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const replaceBy = <T>(inherited: readonly T[], own: readonly T[], key: (item: T) => string): T[] => {
    const keys = new Set(own.map(key));
    return [...inherited.filter(item => !keys.has(key(item))), ...own];
};

const readGeographic = (layer: Element): Extent | null => {
    const box = childElement(layer, 'EX_GeographicBoundingBox');
    if (!box) return null;
    return [
        number(childText(box, 'westBoundLongitude')),
        number(childText(box, 'southBoundLatitude')),
        number(childText(box, 'eastBoundLongitude')),
        number(childText(box, 'northBoundLatitude')),
    ];
};

const readBbox = (element: Element): WmsBoundingBox => ({
    crs: attribute(element, 'CRS') ?? attribute(element, 'SRS') ?? '',
    extent: [
        number(attribute(element, 'minx')),
        number(attribute(element, 'miny')),
        number(attribute(element, 'maxx')),
        number(attribute(element, 'maxy')),
    ],
});

const readStyle = (element: Element): WmsStyle => {
    const legend = childElement(element, 'LegendURL');
    const resource = legend ? childElement(legend, 'OnlineResource') : null;
    return {
        name: childText(element, 'Name') ?? '',
        title: childText(element, 'Title'),
        legendUrl: resource ? attribute(resource, 'href') : null,
    };
};

const readDimension = (element: Element): WmsDimension => ({
    name: (attribute(element, 'name') ?? '').toLowerCase(),
    units: attribute(element, 'units') || null,
    default: attribute(element, 'default') || null,
    values: (element.textContent ?? '').trim().replace(/\s*([,/])\s*/g, '$1').replace(/\s+/g, ' '),
});

const readQueryable = (element: Element, fallback: boolean): boolean => {
    const value = attribute(element, 'queryable');
    if (value === null) return fallback;
    return value === '1' || value.toLowerCase() === 'true';
};

const readLayer = (element: Element, parent: Inherited): WmsLayer => {
    const own: Inherited = {
        queryable: readQueryable(element, parent.queryable),
        crs: unique([...parent.crs, ...childElements(element, 'CRS').concat(childElements(element, 'SRS')).map(item => (item.textContent ?? '').trim()).filter(Boolean)]),
        geographicBbox: readGeographic(element) ?? parent.geographicBbox,
        bbox: replaceBy(parent.bbox, childElements(element, 'BoundingBox').map(readBbox), box => box.crs.toUpperCase()),
        styles: replaceBy(parent.styles, childElements(element, 'Style').map(readStyle), style => style.name),
        dimensions: replaceBy(parent.dimensions, childElements(element, 'Dimension').map(readDimension), dimension => dimension.name),
    };
    return {
        name: childText(element, 'Name'),
        title: childText(element, 'Title') ?? '',
        abstract: childText(element, 'Abstract'),
        ...own,
        children: childElements(element, 'Layer').map(child => readLayer(child, own)),
    };
};

export const parseWmsCapabilities = (xml: string | Document): WmsCapabilities => {
    const root = (typeof xml === 'string' ? parseXml(xml) : xml).documentElement;
    if (!root || !/Capabilities$/.test(root.localName)) {
        throw new OgcError(`Not a WMS capabilities document: <${root?.localName ?? ''}>`);
    }
    const service = childElement(root, 'Service');
    const capability = childElement(root, 'Capability');
    return {
        version: attribute(root, 'version') ?? '',
        title: (service && childText(service, 'Title')) ?? '',
        layers: capability ? childElements(capability, 'Layer').map(layer => readLayer(layer, ROOT)) : [],
    };
};

export const flattenLayers = (capabilities: WmsCapabilities): WmsLayer[] => {
    const all: WmsLayer[] = [];
    const walk = (layer: WmsLayer): void => {
        all.push(layer);
        layer.children.forEach(walk);
    };
    capabilities.layers.forEach(walk);
    return all;
};

export const findLayer = (capabilities: WmsCapabilities, name: string): WmsLayer | null =>
    flattenLayers(capabilities).find(layer => layer.name === name) ?? null;
