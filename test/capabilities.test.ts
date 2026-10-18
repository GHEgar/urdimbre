import { describe, expect, it } from 'vitest';
import { findLayer, flattenLayers, OgcError, parseWmsCapabilities } from '../src/ogc/index.js';
import { fixture } from './helpers.js';

describe('GeoServer capabilities', () => {
    const capabilities = parseWmsCapabilities(fixture('geoserver-capabilities.xml'));

    it('reads version, title and the layer tree', () => {
        expect(capabilities.version).toBe('1.3.0');
        expect(capabilities.title).toBe('GeoSolutions gs-stable GeoServer');
        expect(capabilities.layers).toHaveLength(1);
        const root = capabilities.layers[0];
        expect(root?.name).toBeNull();
        expect(root?.children.map(layer => layer.name)).toEqual(['mapstore:elevation_test', 'topp:states', 'geosolutions:storm_obs_test']);
        expect(flattenLayers(capabilities)).toHaveLength(4);
    });

    it('reads the TIME dimension with its default', () => {
        const storm = findLayer(capabilities, 'geosolutions:storm_obs_test');
        expect(storm?.queryable).toBe(true);
        expect(storm?.dimensions).toEqual([{
            name: 'time',
            units: 'ISO8601',
            default: 'PRESENT',
            values: '1990-07-22T06:00:00.000Z,1990-07-22T12:00:00.000Z,1990-07-22T18:00:00.000Z,1990-07-23T00:00:00.000Z,1990-07-23T06:00:00.000Z,1990-07-23T12:00:00.000Z',
        }]);
    });

    it('reads other dimensions', () => {
        const elevation = findLayer(capabilities, 'mapstore:elevation_test');
        expect(elevation?.dimensions[0]).toMatchObject({ name: 'elevation', units: 'EPSG:5030', default: '100.0' });
    });

    it('inherits the CRS of the root layer', () => {
        const states = findLayer(capabilities, 'topp:states');
        expect(states?.crs).toContain('EPSG:3857');
        expect(states?.crs).toContain('EPSG:900913');
        expect(states?.crs.filter(crs => crs === 'EPSG:4326')).toHaveLength(1);
    });

    it('reads bounding boxes, title, abstract and styles with legends', () => {
        const states = findLayer(capabilities, 'topp:states');
        expect(states?.title).toBe('states');
        expect(states?.abstract).toBe('test description mio');
        expect(states?.bbox).toContainEqual({ crs: 'EPSG:4326', extent: [24.955967, -124.73142200000001, 49.371735, -66.969849] });
        expect(states?.geographicBbox?.[0]).toBeCloseTo(-124.731422);
        expect(states?.styles).toHaveLength(3);
        expect(states?.styles[0]?.name).toBe('polygon');
        expect(states?.styles[0]?.legendUrl).toBe('https://gs-stable.geosolutionsgroup.com/geoserver/ows?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image%2Fpng&width=20&height=20&layer=topp%3Astates');
        expect(findLayer(capabilities, 'nope')).toBeNull();
    });
});

describe('GIBS capabilities', () => {
    const capabilities = parseWmsCapabilities(fixture('gibs-capabilities.xml'));
    const ndvi = findLayer(capabilities, 'MODIS_Terra_L3_NDVI_Monthly');

    it('finds a layer nested two groups down', () => {
        expect(capabilities.layers[0]?.name).toBe('NASA_GIBS_EPSG3857_best');
        expect(capabilities.layers[0]?.children[0]?.name).toBe('Vegetation Indices');
        expect(ndvi?.queryable).toBe(false);
    });

    it('reads the monthly P1M intervals', () => {
        expect(ndvi?.dimensions).toEqual([{
            name: 'time',
            units: 'ISO8601',
            default: '2026-09-01',
            values: '2000-03-01/2025-03-01/P1M,2025-05-01/2026-09-01/P1M',
        }]);
    });

    it('merges inherited and own CRS', () => {
        expect(ndvi?.crs).toEqual(['epsg:3857', 'EPSG:4326', 'EPSG:3857']);
    });

    it('reads the legend of the default style', () => {
        expect(ndvi?.styles).toEqual([{ name: 'default', title: 'default', legendUrl: 'https://gibs.earthdata.nasa.gov/legends/MODIS_L3_NDVI_H.png' }]);
    });
});

describe('inheritance', () => {
    const xml = `<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms" xmlns:xlink="http://www.w3.org/1999/xlink">
  <Service><Title>Inherit</Title></Service>
  <Capability>
    <Layer queryable="1">
      <Title>Root</Title>
      <CRS>EPSG:4326</CRS>
      <BoundingBox CRS="EPSG:4326" minx="0" miny="0" maxx="10" maxy="10"/>
      <Dimension name="TIME" units="ISO8601" default="2020-01-01">2020-01-01/2020-12-01/P1M</Dimension>
      <Dimension name="elevation" units="m">0,10</Dimension>
      <Style><Name>base</Name><Title>Base</Title></Style>
      <Layer>
        <Name>child</Name>
        <Title>Child</Title>
        <CRS>EPSG:3857</CRS>
        <Dimension name="elevation" units="m" default="10">10,20</Dimension>
        <Layer queryable="0">
          <Name>grandchild</Name>
          <Title>Grandchild</Title>
          <BoundingBox CRS="EPSG:4326" minx="1" miny="1" maxx="2" maxy="2"/>
          <Style><Name>own</Name></Style>
        </Layer>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`;
    const capabilities = parseWmsCapabilities(xml);

    it('passes CRS, dimensions, styles, bbox and queryable down', () => {
        const child = findLayer(capabilities, 'child');
        expect(child?.crs).toEqual(['EPSG:4326', 'EPSG:3857']);
        expect(child?.queryable).toBe(true);
        expect(child?.dimensions.map(dimension => [dimension.name, dimension.values])).toEqual([['time', '2020-01-01/2020-12-01/P1M'], ['elevation', '10,20']]);
        const grandchild = findLayer(capabilities, 'grandchild');
        expect(grandchild?.crs).toEqual(['EPSG:4326', 'EPSG:3857']);
        expect(grandchild?.queryable).toBe(false);
        expect(grandchild?.dimensions).toHaveLength(2);
        expect(grandchild?.styles.map(style => style.name)).toEqual(['base', 'own']);
        expect(grandchild?.bbox).toEqual([{ crs: 'EPSG:4326', extent: [1, 1, 2, 2] }]);
    });

    it('accepts a parsed document', () => {
        const parsed = new DOMParser().parseFromString(xml, 'application/xml');
        expect(parseWmsCapabilities(parsed).title).toBe('Inherit');
    });
});

describe('invalid input', () => {
    it('rejects documents that are not capabilities', () => {
        expect(() => parseWmsCapabilities('<Foo/>')).toThrow(OgcError);
    });
});
