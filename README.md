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
| `urdimbre/catalog` | `defineCatalog`, `enrichFromCapabilities`, `createLayerState`, `describe`, `describeState` | nothing |
| `urdimbre/arbiter` | `createArbiter`: one tool owns the click at a time | nothing |
| `urdimbre/state` | `encodeState`, `decodeState`, `bindUrl`, `readLayerState`, `applyLayerState` | `history` and `location` for `bindUrl` |
| `urdimbre/legend` | `legendFromWms`, `legendFromClasses`, `legendFromMapLibreStyle`, `legendForState` | nothing |
| `urdimbre/identify` | `identify`: progressive, cancelable `GetFeatureInfo` | `fetch` |
| `urdimbre/ol` | `bindOl`, `bindArbiter` | `ol` 10 |
| `urdimbre/maplibre` | `bindMapLibre`, `bindArbiter` | a MapLibre GL JS 6 map (types only) |
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
missing, even if the CQL filters by date.

## Catalog

`defineCatalog(input)` takes `{ layers }` or an array and returns a frozen `{ layers, hash, get(id) }`.

| Field | What it is |
|---|---|
| `id`, `kind` | Unique id; `wms`, `vector-tiles`, `pmtiles`, `geojson` or `xyz` |
| `wms` | `{ url, layers, styles, format, tiled, tileSize, version }`, required for `wms` |
| `tiles` | `{ url, sourceLayer }`, required for `vector-tiles`, `pmtiles` and `xyz` |
| `data`, `wfs` | Inline GeoJSON or its URL, or `{ url, typeName, geometryName, idField }`; one is required for `geojson` |
| `dimensions` | `{ time: { default, values } }`; any name, such as `elevation` or `level` |
| `title`, `abstract`, `tags`, `capabilities`, `attribution`, `bbox`, `legendUrl`, `minZoom`, `maxZoom`, `crossOrigin` | Metadata |

Errors are `CatalogError`s with the `path` of the field, such as `layers[2].wms.layers`, also for
unknown fields. `hash` is FNV-1a over the JSON with sorted keys, so it can key an immutable file.
`enrichFromCapabilities(catalog, client)` fills title, abstract, bbox, dimensions and legend URL
from one `GetCapabilities` per service without overwriting what the catalog declares.

## Layer state

`createLayerState(catalog, initial, { cqlOrder })` is a store with `add(id, at)`, `remove`,
`move(id, to)`, `setOpacity`, `setVisible`, `setDimension(id, name, value)`, `composer(id)`,
`subscribe` and `getSnapshot`. The snapshot is `{ active, opacity, visible, dimensions, cql }`;
`active[0]` is the top layer, and records only hold what differs from the defaults (opacity 1,
visible). Each layer has its own CQL composer. `select(selector, listener, equal)` calls `listener`
only when the selected value changes.

## Descriptions

`describe(catalog, snapshot)` is pure: one `LayerDescription` per active layer with `id`, `kind`,
`zIndex`, `opacity`, `visible`, zoom range, `source` and `key`, the canonical URL of the source.

- WMS is tiled unless the layer says `tiled: false`: `TILED=true`, a fixed tile size and canonical
  parameters. Dimensions go as `TIME`, `ELEVATION` or `DIM_<NAME>`, the layer CQL as `CQL_FILTER`.
- `zIndex` is `100 + (layers - position) * 10`; tools keep `900`–`999` (`TOOL_Z_MIN`, `TOOL_Z_MAX`).
- `describeState(catalog, state)` gives the `{ getDescriptions, subscribe }` the adapters take.

## Arbiter

`createArbiter({ onEscape })` gives the map click to one tool at a time. `claim(tool, { click,
escape })` makes it active and releases the previous tool through its `escape`; the returned function
releases it. With no tool active, the click goes to the handlers claimed as `IDENTIFY`. `click(e)` and
`escape()` return whether someone took them. `onEscape(handler)` hangs the arbiter from an outer
Escape stack while a tool is active. `subscribe` and `getSnapshot()` give `{ active }`.

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
`{ layers, fragments }` with the fragments of every composer, and `applyLayerState(layerState,
partial)` brings a store to a decoded state with the least calls. `bindUrl({ catalog, read, apply,
subscribe, history, location, debounce })` applies the URL it starts with, writes map moves with
`replaceState` after `debounce` (250 ms) and layer or tool changes with `pushState`, so back and
forward work, and applies `popstate` without writing back. `history`, `location` and the `popstate`
target (`events`) default to `globalThis` when it is called, never when it is imported.

## Legend

A legend is data, one `LegendEntry` per layer: `classes` (`label`, `color`, `min`, `max`, `count`),
`ramp` (`stops`), `image` (`url`) or `symbols` (`label`, `color`, `shape`).

- `legendFromWms(description, def, { width, height, format, params })` builds a canonical
  `GetLegendGraphic` with the same `TIME`, dimensions and `CQL_FILTER` as the layer, so the legend
  matches what the map shows. Layers that are not WMS use their `legendUrl`.
- `legendFromClasses(layerId, title, classes, counts, { colors, format })` takes `{ min, max }`
  classes, such as a hexbin legend, or `{ breaks }`; `counts` fills the histogram.
- `legendFromMapLibreStyle(layerId, title, layers)` reads `step` as classes, `interpolate` as a ramp,
  `match` and plain colors as symbols; `metadata['urdimbre:label']` names a style layer.
- `legendForState(catalog, descriptions, { custom, hidden })` lists the visible layers from the top;
  `custom(description, def)` returns your own entry for a layer.

## Identify

`identify({ client, catalog, descriptions, at, signal, featureCount, layers })` is an async iterable.
It sends one `GetFeatureInfo` per WMS service (and per dimension values) for the visible layers with
the `identify` capability, with `QUERY_LAYERS`, the `TIME` of the layers and one `CQL_FILTER` per
layer joined with `;`. It yields `{ layerId, features, more }` or `{ layerId, error }` as each answer
arrives, so one failing service does not hide the others. `at` is `{ coordinate, pixel, resolution,
size, bbox, crs }` (`EPSG:3857` by default). Aborting `signal`, or leaving the loop, ends the
iteration and cancels every request. `more` says the answer reached `featureCount` (10): ask again
with a larger count and `layers: [id]` for that layer only.

## OpenLayers

`bindOl(map, source, { createLayer })` adds one layer per description, tagged with `urdimbre:id`, and
never touches other layers. On each change it does the least: `setOpacity`, `setVisible`,
`setZIndex`, and `updateParams` with only the parameters that changed when the CQL or a dimension
moves. A source is recreated only when its `key` changes and cannot be updated. WMS uses `TileWMS` (or
`ImageWMS` with `ratio: 1`) without `hidpi`, so every device asks for the same tiles. `createLayer`
returns your own layer for a description, which PMTiles needs. `bindArbiter(map, arbiter)` turns
`singleclick` into `{ coordinate: [lon, lat], pixel, originalEvent }`. Both return a cleanup function.

## MapLibre

`bindMapLibre(map, source, { layers, beforeId })` takes any object with the `MapLibreMapLike` methods
and never imports `maplibre-gl` at run time. WMS becomes a `raster` source whose tile URL is
canonical up to `&BBOX={bbox-epsg-3857}`; vector tiles and PMTiles become `vector` sources (register
the `pmtiles://` protocol yourself) and GeoJSON a `geojson` source. When a `key` changes it calls
`setTiles` or `setData` if the source has them and replaces the source otherwise. Order uses
`moveLayer` below `beforeId`; opacity uses `raster-opacity` and its equivalents; visibility uses
`visibility`. `layers(description)` returns the style layers for vector data (a `line` by default).
It waits for the style and adds its layers again after `setStyle`. `bindArbiter(map, arbiter)` turns
`click` into a pointer.

## Known limitations

- WMS capabilities are 1.3.0 only and need `DOMParser`. WFS is 2.0.0 with JSON output, never GML.
- The CQL of a layer reaches WMS and WFS sources only; vector tiles and PMTiles ignore it.
- OpenLayers has no built-in PMTiles source: pass `createLayer`. MapLibre draws `tiled: false` WMS
  as tiles too, and has no `crossOrigin` per source (use `transformRequest`).
- A grouped `GetFeatureInfo` is split by feature id (`states.12` belongs to `topp:states`); features
  without a matching prefix go to the top layer of the group. Only WMS layers are identified.
- The URL keeps opacity, dimensions and CQL of the active layers only. There is no demo yet.

## Development

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

The tests run on Vitest with happy-dom against trimmed real answers from a public GeoServer and NASA
GIBS, a real OpenLayers map, a recording MapLibre double and fake `fetch` and `history`.

A `vX.Y.Z` tag that matches `package.json` runs `release.yml`: tests, the GitHub release with that
version's changelog section, npm with provenance and GitHub Packages.

## Contributing

Issues are welcome. Open one before sending a pull request.

## License

AGPL-3.0-only © GHEgar
