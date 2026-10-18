export const GS = 'https://gs-stable.geosolutionsgroup.com/geoserver/ows';

export const catalogInput = () => ({
    layers: [
        { id: 'states', title: 'States', kind: 'wms', wms: { url: GS, layers: 'topp:states', styles: 'polygon' }, wfs: { url: GS, typeName: 'topp:states', geometryName: 'the_geom' } },
        { id: 'storms', kind: 'wms', wms: { url: GS, layers: 'geosolutions:storm_obs_test' }, dimensions: { time: { default: '1990-07-22T06:00:00.000Z' } }, capabilities: ['time'] },
        { id: 'elevation', kind: 'wms', wms: { url: GS, layers: 'mapstore:elevation_test', tiled: false } },
        { id: 'osm', title: 'OSM', kind: 'xyz', tiles: { url: 'https://tile.example.org/{z}/{x}/{y}.png' }, attribution: '© OpenStreetMap', maxZoom: 19 },
        { id: 'roads', title: 'Roads', kind: 'vector-tiles', tiles: { url: 'https://tiles.example.org/roads/{z}/{x}/{y}.pbf', sourceLayer: 'roads' } },
        { id: 'parcels', title: 'Parcels', kind: 'pmtiles', tiles: { url: 'https://data.example.org/parcels.pmtiles', sourceLayer: 'parcels' } },
        { id: 'points', title: 'Points', kind: 'geojson', data: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-103.35, 20.67] }, properties: { name: 'a' } }] } },
        { id: 'wfs-states', title: 'States as GeoJSON', kind: 'geojson', wfs: { url: GS, typeName: 'topp:states' } },
    ],
});
