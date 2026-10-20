# <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/icon-dark.svg"><img src=".github/assets/icon-light.svg" width="36" height="36" alt=""></picture> urdimbre

[![npm](https://img.shields.io/npm/v/urdimbre)](https://www.npmjs.com/package/urdimbre)
[![size](https://img.shields.io/bundlejs/size/urdimbre)](https://bundlejs.com/?q=urdimbre)
[![license](https://img.shields.io/github/license/GHEgar/urdimbre)](LICENSE)

Headless map layer core: OGC client, CQL composer, layer catalog and reconciler for OpenLayers and MapLibre.

urdimbre owns the layers of a web map: the catalog, which layers are on and in what order, their
opacity, dimensions and `CQL_FILTER` (named fragments, so several tools filter one layer without
overwriting each other), the canonical URL of every request, which tool gets the click, the state in
the page URL, the legend and identify. It applies the difference to OpenLayers or MapLibre. You own
the map, the UI and every pixel: no styles, only data, promises and stores.

## Install

```bash
npm install urdimbre
```

| Entry | What it is | Needs |
|---|---|---|
| `urdimbre/ogc` | `createOgcClient`, `canonicalUrl`, `parseWmsCapabilities`, `OgcError` | `fetch`; `DOMParser` for WMS capabilities |
| `urdimbre/cql` | `createCqlComposer` and the helpers `and`, `or`, `not`, `inList`, `between`, `bbox`, quoting | nothing |
| `urdimbre/catalog` | `defineCatalog`, `createLiveCatalog`, `enrichFromCapabilities`, `createLayerState`, `describe`, `describeState` | nothing |
| `urdimbre/arbiter` | `createArbiter`: one tool owns the click at a time | nothing |
| `urdimbre/state` | `encodeState`, `decodeState`, `bindUrl`, `readLayerState`, `applyLayerState` | `history` and `location` for `bindUrl` |
| `urdimbre/legend` | `legendFromWms`, `legendFromClasses`, `legendFromMapLibreStyle`, `legendForState`, `classFilterCql` | nothing |
| `urdimbre/identify` | `identify`: progressive, cancelable `GetFeatureInfo` | `fetch` |
| `urdimbre/geocode` | Offline place-name index and a Photon geocoder client | `fetch` |
| `urdimbre/ol` | `bindOl`, `bindArbiter` | `ol` 10 |
| `urdimbre/maplibre` | `bindMapLibre`, `bindArbiter`, `renderedQuery` | a MapLibre GL JS 6 map (types only) |
| `urdimbre` | everything but `ol` and `maplibre` | as above |

## Quick start

```ts
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { createLayerState, defineCatalog, describeState } from 'urdimbre/catalog';
import { bindOl } from 'urdimbre/ol';

const catalog = defineCatalog({ layers: [
    { id: 'states', title: 'States', kind: 'wms', wms: { url: 'https://example.org/geoserver/wms', layers: 'topp:states' } },
] });
const layers = createLayerState(catalog, { active: ['states'] });
const map = new OlMap({ target: 'map', view: new View({ center: [0, 0], zoom: 2 }) });
bindOl(map, describeState(catalog, layers));

layers.composer('states').set('table', 'PERSONS > 1000000');
layers.setOpacity('states', 0.7);
```

## Preparing your server

urdimbre speaks plain OGC, with GeoServer as the reference implementation.

1. Allow CORS for the origin of your app, or put the services behind the same origin.
2. Turn on tile caching for the WMS layers (GeoWebCache with direct WMS integration in GeoServer):
   urdimbre asks for 256 or 512 px tiles on a fixed grid with `TILED=true`.
3. Enable JSON output for WFS and `GetFeatureInfo` (`application/json`).
4. For `wpsUnique`, install the WPS extension: it calls `gs:PagedUnique`.
5. Give every layer you page a stable sort field: urdimbre refuses a `startIndex` without `sortBy`.

| Feature | Service | Check |
|---|---|---|
| `wmsCapabilities`, `enrichFromCapabilities` | WMS 1.3.0 | `?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0` answers XML |
| `wmsFeatureInfo`, `identify` | WMS 1.3.0 | `INFO_FORMAT=application/json` is listed in `GetFeatureInfo` |
| `legendFromWms` | WMS `GetLegendGraphic` | `?SERVICE=WMS&REQUEST=GetLegendGraphic&VERSION=1.0.0&FORMAT=image/png&LAYER=…` answers an image |
| `wfsDescribe`, `wfsGetFeature`, `wfsHits`, `wfsPages` | WFS 2.0.0 | `DescribeFeatureType` with `OUTPUTFORMAT=application/json` answers JSON |
| `wpsUnique` | WPS 1.0.0 | `gs:PagedUnique` appears in the WPS `GetCapabilities` |

## The client

`canonicalUrl(base, params)` builds every URL, and that URL is the cache key: keys in upper case and
sorted, no empty values, lists joined with commas, `BBOX` with up to 6 decimals, booleans as
`true`/`false`, dates as ISO 8601, the query of the base merged and `,:/` left readable.

`createOgcClient({ fetch, headers, ttl, maxUrl })` never touches the network when it is created.
`ttl` (5 minutes) keeps an in-memory cache; URLs longer than `maxUrl` (2000) go as a form `POST`.
Every method takes an `AbortSignal` and rejects with an `OgcError` (`message`, `code`, `status`,
`url`), also when GeoServer answers an exception with HTTP 200.

| Method | Request | Cached |
|---|---|---|
| `wmsCapabilities(url)` | WMS `GetCapabilities` 1.3.0 | yes |
| `wmsFeatureInfo(url, req)` | WMS `GetFeatureInfo` as GeoJSON, `TIME` apart from the CQL | no |
| `wfsDescribe(url, typeName)` | WFS `DescribeFeatureType`: `{ typeName, geometry, fields }` | yes |
| `wfsGetFeature(url, req)` | WFS 2.0.0 `GetFeature` as GeoJSON | no |
| `wfsHits(url, req)`, `wfsPages(url, req)` | `RESULTTYPE=hits`; an async iterable of pages | no |
| `wpsUnique(url, typeName, field)` | WPS `gs:PagedUnique`, values as strings | no |

Equal calls share one `fetch`, also while in flight. `findLayer` and `flattenLayers` walk the layer
tree. GeoServer rejects `BBOX` with `CQL_FILTER`: pass `geometryName` and the box joins the CQL.

## CQL

`createCqlComposer({ order })` keeps the `CQL_FILTER` of one layer as named fragments: `set(name,
fragment)` (blank removes it), `get`, `names`, `compose()` (joined with `AND`, or `null`),
`subscribe` and `getSnapshot` for `useSyncExternalStore`. Fragments in `order` go first, the rest
alphabetically, so the same state always gives the same string. The helpers `quoteIdentifier`,
`quoteLiteral`, `escapeLike`, `and`, `or`, `not`, `inList`, `between` and `bbox` drop empty parts.
Keep dates of a `TIME` dimension out of the CQL: GeoServer applies the default time when `TIME` is
missing, even if the CQL filters by date. `bbox(field, box, srs, { axisOrder })` writes `box` as given
(`'lonlat'`); GeoServer may read `EPSG:4326` latitude first: pass `'latlon'`, or use `CRS:84`.

## Catalog

`defineCatalog(input)` takes `{ layers }` or an array and returns a frozen `{ layers, hash, get(id) }`.

| Field | What it is |
|---|---|
| `id`, `kind` | Unique id; `wms`, `vector-tiles`, `pmtiles`, `geojson` or `xyz` |
| `wms` | `{ url, layers, styles, format, tiled, tileSize, version }`, required for `wms` |
| `tiles` | `{ url, sourceLayer }`, required for `vector-tiles`, `pmtiles` and `xyz` |
| `data`, `wfs` | Inline GeoJSON or its URL, or `{ url, typeName, geometryName, idField }`; one is required for `geojson` |
| `geometryType` | `point`, `line` or `polygon`, for `vector-tiles`, `pmtiles` and `geojson`: the legend shape and the default MapLibre style layer |
| `dimensions` | `{ time: { default, values } }`; any name, such as `elevation` or `level` |
| `opacity` | Starting opacity (0–1), used when the initial state gives none |
| `metadata` | A free object for your app (thumbnails, skins): never checked inside, part of the `hash` |
| `title`, `abstract`, `tags`, `capabilities`, `attribution`, `bbox`, `legendUrl`, `minZoom`, `maxZoom`, `crossOrigin` | Metadata |

Errors are `CatalogError`s with the field `path` (`layers[2].wms.layers`), also for unknown fields.
`hash` is FNV-1a over the JSON with sorted keys. `enrichFromCapabilities(catalog, client)` fills
title, abstract, bbox, dimensions and legend URL from one `GetCapabilities` per service, never over
what the catalog declares. `defineLayer(def, path)` validates and freezes a single layer.

### Live catalog

`createLiveCatalog(base)` takes a `Catalog` (or the input of `defineCatalog`) and returns a
`LiveCatalog`: a `Catalog` whose layers change at run time, for layers the user uploads or a server
lists after start.

```ts
const catalog = createLiveCatalog(defineCatalog(input));
const layers = createLayerState(catalog);
bindMapLibre(map, describeState(catalog, layers));

catalog.add({ id: 'mine', kind: 'vector-tiles', tiles: { url: '/tiles/mine/{z}/{x}/{y}.pbf' }, geometryType: 'polygon' });
layers.add('mine');
catalog.set({ ...catalog.get('mine'), title: 'Renamed' });
catalog.remove('mine');
```

- `add(def)` validates like `defineCatalog` (errors say `layer.<field>`), freezes and appends; it
  throws a `CatalogError` if the id exists. `set(def)` adds or replaces in place, and does nothing
  when the def is equal. `remove(id)` returns whether it was there. `has(id)`, `get(id)`, `layers`.
- `hash` changes with every change. `subscribe(listener)` is called after each one.
- `describeState` follows the catalog too: a removed layer leaves the map while staying in the
  layer state, and comes back if its id is added again. `createLayerState` applies the `opacity`
  of layers added later. `encodeState`, `decodeState`, `legendForState` and `identify` read the
  catalog on each call, so they see the current layers.

## Layer state

`createLayerState(catalog, initial, { cqlOrder })` is a store with `add(id, at)`, `remove`,
`move(id, to)`, `setOpacity`, `setVisible`, `setDimension(id, name, value)`, `composer(id)` (one CQL
composer per layer), `subscribe`, `getSnapshot` and `select(selector, listener, equal)`, which calls
`listener` only when the selected value changes. The snapshot is `{ active, opacity, visible,
dimensions, cql }`; `active[0]` is the top layer, and records skip opacity 1 and visible layers.

## Descriptions

`describe(catalog, snapshot)` is pure: one `LayerDescription` per active layer with `id`, `kind`,
`zIndex`, `opacity`, `visible`, zoom range, `source` and `key`, the canonical URL of the source.

- WMS is tiled unless the layer says `tiled: false`: `TILED=true`, a fixed tile size and canonical
  parameters. Dimensions go as `TIME`, `ELEVATION` or `DIM_<NAME>`, the layer CQL as `CQL_FILTER`.
- `zIndex` is `100 + (layers - position) * 10`; tools keep `900`–`999` (`TOOL_Z_MIN`, `TOOL_Z_MAX`).
- `describeState(catalog, state)` gives the `{ getDescriptions, subscribe }` the adapters take; with
  a live catalog it also listens to it.
- `geometryType` from the def is copied to the description; it is not part of the `key`.

## Arbiter

`createArbiter({ onEscape })` gives the map click to one tool at a time. `claim(tool, { click,
escape })` makes it active and releases the previous tool through its `escape`; the returned function
releases it. With no tool active, the click goes to `IDENTIFY`. `click(e)` and `escape()` return
whether someone took them; `onEscape(handler)` hangs it from an outer Escape stack while a tool is
active. `subscribe` and `getSnapshot()` give `{ active }`.

## URL state

The URL is the state: `encodeState(state, catalog)` writes a `PortalState` (`view`, `layers`,
`fragments`, `tool`, `extra`) as a short query, and `decodeState(query, catalog)` reads it back.

```text
v=20.6767,-103.3475,14.2,0,45&l=hex:90,ndvi!~time=2026-10,roads&f=hex~table:UE9QID4gMTA&t=measure
```

| Key | Holds |
|---|---|
| `v` | Latitude, longitude (decimals follow the zoom), zoom (1 decimal), bearing and pitch (integers) |
| `l` | Active layers, top first; `!` hidden, `:70` opacity in percent, `~name=value` per dimension |
| `f` | CQL fragments as `layer~name:base64url`, so quotes, accents and `&` survive |
| `t` | The active tool; any other key goes to `extra` untouched |

Unknown layer ids and malformed parts are skipped, never thrown. `readLayerState(layerState)` gives
`{ layers, fragments }`; `applyLayerState(layerState, partial)` brings a store to a decoded state
with the least calls, and layers the URL leaves out go back to their catalog `opacity`.
`bindUrl({ catalog, read, apply, subscribe, history, location, debounce })` applies the starting URL,
writes map moves with `replaceState` after `debounce` (250 ms) and layer or tool changes with
`pushState`, and applies `popstate` without writing back. `history`, `location` and `events` (the
`popstate` target) default to `globalThis` when it is called, never when it is imported.

## Legend

A legend is data, one `LegendEntry` per layer: `classes` (`label`, `color`, `min`, `max`, `count`),
`ramp` (`stops`), `image` (`url`) or `symbols` (`label`, `color`, `shape`).

- `legendFromWms(description, def, { width, height, format, params })` builds a canonical
  `GetLegendGraphic` with the `TIME`, dimensions and `CQL_FILTER` of the layer; others use `legendUrl`.
- `legendFromClasses(layerId, title, classes, counts, { colors, format })` takes `{ min, max }`
  classes, such as a hexbin legend, or `{ breaks }`; `counts` fills the histogram.
- `legendFromMapLibreStyle(layerId, title, layers)` reads `step` as classes, `interpolate` as a ramp,
  `match` and plain colors as symbols; `metadata['urdimbre:label']` names a style layer.
- `classFilterCql(field, classes, visible, { lastInclusive })` turns the visible class indexes into a
  CQL fragment: `null` when all are visible, `EXCLUDE` when none, one range per class otherwise.
  `classesFromCql(fragment, field, classes)` reads the selection back, or `null` for foreign CQL.
- `legendForState(catalog, descriptions, { custom, hidden, symbolColor, shapeLabels })` lists the
  visible layers from the top; `custom(description, def)` returns your own entry for a layer. WMS and
  `legendUrl` give an `image`. `vector-tiles`, `pmtiles` and `geojson` give `symbols` with the shape
  of `geometryType` (`polygon` is `fill`), or the shapes found in inline GeoJSON: one item named after
  the layer, or one per shape labeled by `shapeLabels` (`Points`, `Lines`, `Areas`). The color is
  `symbolColor` (a string or `(description, def) => string`), else `currentColor`
  (`DEFAULT_SYMBOL_COLOR`). `shapesOf(def)` gives those shapes.

## Identify

`identify({ client, catalog, descriptions, at, signal, featureCount, layers, tolerance, query })`
yields `{ layerId, features, more }` or `{ layerId, error }` for each visible layer with `identify`
as soon as it is known; aborting `signal` or leaving the loop cancels every request.

- WMS: one `GetFeatureInfo` per service and dimension values, with `QUERY_LAYERS`, `TIME` and one
  `CQL_FILTER` per layer joined with `;`. `at` is `{ coordinate, pixel, resolution, size, bbox, crs }`.
  `more` says `featureCount` (10) was reached: ask again with a larger count and `layers: [id]`.
- GeoJSON, vector tiles and PMTiles answer first: `query(layerId, at, tolerance)` returns what is
  drawn under the pointer; on `null`, inline GeoJSON is hit locally within `tolerance` px (5) from
  `coordinate` and `resolution` in `EPSG:3857` (the default) or `EPSG:4326`.

## Geocode

`createPlaceIndex(places, { kindRank })` searches names without the network. Matching ignores case,
accents and punctuation. Exact names come first; prefixes and word prefixes share the next tier,
ordered by `kindRank` and by distance to `near`; substrings come last.

```ts
const index = createPlaceIndex(places, { kindRank: { locality: 0, neighbourhood: 1, street: 2 } })
index.search('av chapul', { near: [-103.35, 20.67], limit: 8 })
```

`createPhotonClient({ url, lang, fetch })` queries a Photon server (the public
`https://photon.komoot.io/api/` by default, or your own). URLs are canonical, results are cached and
`search(query, { near, radius, bbox, limit, signal })` returns the same `Place` shape as the index;
`near` biases the ranking and, with `radius` in degrees, also limits results to that box.

## OpenLayers

`bindOl(map, source, { createLayer })` adds one layer per description, tagged with `urdimbre:id`, and
never touches other layers. On each change it does the least: `setOpacity`, `setVisible`,
`setZIndex`, and `updateParams` with only the parameters that changed when the CQL or a dimension
moves. A source is recreated only when its `key` changes and cannot be updated. WMS uses `TileWMS` (or
`ImageWMS` with `ratio: 1`) without `hidpi`, so every device asks for the same tiles. `createLayer`
returns your own layer for a description, which PMTiles needs. `bindArbiter(map, arbiter)` turns
`singleclick` into `{ coordinate: [lon, lat], pixel, originalEvent }`. Both return a cleanup function;
the one from `bindOl` also has `refresh(id?)`, which builds the layer again (calling `createLayer`)
in its place, for one id or every bound layer.

## MapLibre

`bindMapLibre(map, source, { layers, beforeId, baseUrl })` takes any `MapLibreMapLike` and never imports
`maplibre-gl` at run time. WMS becomes a `raster` source canonical up to `&BBOX={bbox-epsg-3857}`,
vector tiles and PMTiles `vector` sources (register `pmtiles://` yourself), GeoJSON a `geojson` one.
A new `key` calls `setTiles` (only for a new template, remembered even when the source does not
expose `tiles`) or `setData`, or replaces the source in its place. MapLibre needs absolute URLs:
`baseUrl` (such as `location.href`) resolves relative `tiles`, TileJSON, PMTiles and GeoJSON URLs,
keeping `{z}`, `{x}`, `{y}` and `{bbox-epsg-3857}`; `resolveUrl(url, baseUrl)` does the same. Through `getLayersOrder` it moves only its own layers that are out of order, below `beforeId`,
so foreign layers in between (deck.gl interleaved) stay put. `layers(description)` gives the style
layers for vector data (`circle`, `line` or `fill` from `geometryType`, else a `line`); opacity and `visibility` are paint and layout
properties. It waits for the style and adds its layers again after `setStyle`. `bindArbiter(map,
arbiter)` turns `click` into a pointer; `renderedQuery(map)` is the `query` for `identify`.

`bindMapLibre` returns a cleanup function with `refresh(id?)`: it removes and adds again the source
and style layers of one active layer (or all), asking `layers(description)` again, without leaving
the layer state and in the same place. Use it when the style or the tiles behind an unchanged URL
change. Inactive ids are ignored; before the style loads it waits.

## Known limitations

- WMS capabilities are 1.3.0 only and need `DOMParser`. WFS is 2.0.0 with JSON output, never GML.
- The CQL of a layer reaches WMS and WFS sources only; vector tiles and PMTiles ignore it.
- OpenLayers has no built-in PMTiles source: pass `createLayer`. MapLibre draws `tiled: false` WMS
  as tiles too, and has no `crossOrigin` per source (use `transformRequest`).
- A grouped `GetFeatureInfo` is split by feature id (`states.12` is `topp:states`), else to the top
  layer. Without `query`, only WMS and inline GeoJSON are identified.
- The URL keeps opacity, dimensions and CQL of the active layers only. There is no demo yet.

## Development

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Vitest with happy-dom runs against trimmed real answers from a public GeoServer and NASA GIBS, a real
OpenLayers map, a recording MapLibre double and fake `fetch` and `history`. A `vX.Y.Z` tag matching
`package.json` runs `release.yml`: tests, a GitHub release with its changelog, npm and GitHub Packages.

## Contributing

Issues are welcome. Open one before sending a pull request.

## License

AGPL-3.0-only © GHEgar
