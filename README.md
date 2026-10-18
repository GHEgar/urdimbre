# <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/icon-dark.svg"><img src=".github/assets/icon-light.svg" width="36" height="36" alt=""></picture> urdimbre

[![npm](https://img.shields.io/npm/v/urdimbre)](https://www.npmjs.com/package/urdimbre)
[![size](https://img.shields.io/bundlejs/size/urdimbre)](https://bundlejs.com/?q=urdimbre)
[![license](https://img.shields.io/github/license/GHEgar/urdimbre)](LICENSE)

Headless OGC client and CQL composer for web maps: canonical URLs, caching, WMS, WFS and WPS.

urdimbre owns the talking to the server — the canonical URL of every request, the cache, WMS
capabilities, WFS schemas and pages, WPS unique values, OGC exceptions — and the `CQL_FILTER` of a
layer, built from named fragments so that several tools can filter the same layer without overwriting
each other. You own the map, the UI and every pixel: it ships no styles, no map engine and no
dependencies, only data, promises and a subscribable store.

## Install

```bash
npm install urdimbre
```

| Entry | What it is | Needs |
|---|---|---|
| `urdimbre/ogc` | `createOgcClient`, `canonicalUrl`, `parseWmsCapabilities`, `OgcError` | `fetch`; `DOMParser` for WMS capabilities |
| `urdimbre/cql` | `createCqlComposer` and the helpers `and`, `or`, `not`, `inList`, `between`, `bbox`, quoting | nothing |
| `urdimbre` | Both of the above | as above |

## Quick start

```ts
import { createCqlComposer, inList } from 'urdimbre/cql';
import { createOgcClient, findLayer } from 'urdimbre/ogc';

const client = createOgcClient();
const capabilities = await client.wmsCapabilities('https://example.org/geoserver/wms');
const time = findLayer(capabilities, 'topp:states')?.dimensions.find(item => item.name === 'time');

const filter = createCqlComposer({ order: ['base', 'table', 'bbox'] });
filter.set('table', inList('SUB_REGION', ['Pacific', 'Mtn']));

const page = await client.wfsGetFeature('https://example.org/geoserver/wfs', {
    typeName: 'topp:states', cql: filter.compose(), sortBy: 'STATE_NAME', startIndex: 0, count: 50,
});

export { page, time };
```

## Preparing your server

urdimbre speaks plain OGC, with GeoServer as the reference implementation.

1. Allow CORS for the origin of your app, or put the services behind the same origin.
2. Enable JSON output for WFS (`application/json`, on by default in GeoServer) and for
   `GetFeatureInfo`.
3. For `wpsUnique`, install the WPS extension: it calls the `gs:PagedUnique` process.
4. Give every layer you page a stable sort field: GeoServer needs `sortBy` to page tables without a
   primary key, and urdimbre refuses a `startIndex` without one.

| Feature | Service | Check |
|---|---|---|
| `wmsCapabilities` | WMS 1.3.0 | `?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0` answers XML |
| `wmsFeatureInfo` | WMS 1.3.0 | `INFO_FORMAT=application/json` is listed in `GetFeatureInfo` |
| `wfsDescribe`, `wfsGetFeature`, `wfsHits`, `wfsPages` | WFS 2.0.0 | `DescribeFeatureType` with `OUTPUTFORMAT=application/json` answers JSON |
| `wpsUnique` | WPS 1.0.0 | `gs:PagedUnique` appears in `GetCapabilities` of the WPS |

## Canonical URLs

Every request goes through `canonicalUrl(base, params)`, and that URL is the cache key: two requests
that mean the same produce the same URL byte by byte.

| Rule | Example |
|---|---|
| Keys in upper case, sorted alphabetically | `{ version, request }` → `REQUEST=…&VERSION=…` |
| No empty, `null` or `undefined` values, no empty lists | `{ STYLES: '' }` → dropped |
| Lists joined with commas | `['a', 'b']` → `a,b` |
| `BBOX` with up to 6 decimals, no trailing zeros | `20.50000001` → `20.5` |
| Booleans as `true`/`false`, dates as ISO 8601, `-0` as `0` | |
| The query in the base URL is merged; `params` win | `…/ows?service=WFS` + `{ SERVICE: 'WMS' }` |
| Commas, colons and slashes stay readable | `TYPENAMES=topp:states`, `TIME=2020-01/2020-02` |

## The client

`createOgcClient(options)` never touches the network when it is created. Every method takes an
`AbortSignal` and rejects with an `OgcError` when the server answers with an exception.

| Option | Default | What it does |
|---|---|---|
| `fetch` | `globalThis.fetch` | The function used for every request |
| `headers` | none | Headers added to every request |
| `ttl` | `300000` | Milliseconds a cached answer stays fresh |
| `maxUrl` | `2000` | Longer URLs are sent as a form-encoded `POST` to the base URL |

| Method | Request | Cached |
|---|---|---|
| `wmsCapabilities(url)` | WMS `GetCapabilities` 1.3.0 | yes |
| `wmsFeatureInfo(url, req)` | WMS `GetFeatureInfo` as GeoJSON | no |
| `wfsDescribe(url, typeName)` | WFS `DescribeFeatureType` as JSON | yes |
| `wfsGetFeature(url, req)` | WFS `GetFeature` as GeoJSON | no |
| `wfsHits(url, req)` | WFS `GetFeature` with `RESULTTYPE=hits` | no |
| `wfsPages(url, req)` | An async iterable of `GetFeature` pages | no |
| `wpsUnique(url, typeName, field)` | WPS `gs:PagedUnique`, values as strings | no |
| `clear()` | Empties the cache | |

Two equal calls make one `fetch`, and a call that arrives while the first is in flight shares it.
Aborting one caller does not cancel the request for the others; the request is cancelled when every
caller has aborted. Failed requests are never cached.

### Capabilities

`WmsCapabilities` is `{ version, title, layers }`. Each `WmsLayer` has `name` (`null` for unnamed
groups), `title`, `abstract`, `queryable`, `crs`, `geographicBbox`, `bbox`, `styles` with their
`legendUrl`, `dimensions` and `children`. Layers inherit from their parents as WMS 1.3.0 says: CRS and
styles are added, bounding boxes and dimensions are replaced by name, `queryable` is passed down.
Dimension names are lower case and `values` is the raw extent, such as
`2000-03-01/2025-03-01/P1M`. `findLayer` and `flattenLayers` walk the tree, and
`parseWmsCapabilities` reads a document you already have.

### WFS

`GetFeatureRequest` takes `typeName`, `cql`, `bbox`, `srsName`, `propertyNames`, `sortBy` (a string or
`{ field, direction }[]`), `startIndex`, `count`, `outputFormat` and extra `params`. Requests use WFS
2.0.0 and JSON. GeoServer rejects `BBOX` together with `CQL_FILTER`, so when you pass both, add
`geometryName` and the box joins the CQL as `BBOX(…)`. `wfsPages` takes a `pageSize`, walks
`startIndex` and stops on a short page, at `numberMatched` or at `count`.

`wfsDescribe` returns `{ typeName, geometry: { name, type } | null, fields: { name, type, nillable }[] }`.

### Errors

`OgcError` carries `message` (the text of the server), `code` (`exceptionCode` or `code`), `status` and
the canonical `url`. GeoServer answers some exceptions with HTTP 200 and an XML
`ServiceExceptionReport`; those are errors too.

## CQL

`createCqlComposer({ order })` keeps the `CQL_FILTER` of one layer as named fragments.

| Method | What it does |
|---|---|
| `set(name, fragment)` | Sets a fragment; `null`, `undefined` or blank removes it |
| `get(name)`, `names()` | Reads the fragments, `names()` in join order |
| `compose()` | The fragments joined with `AND`, or `null` |
| `subscribe(listener)` | Called once per real change; returns the unsubscribe function |
| `getSnapshot()` | `{ fragments, cql }`, the same object while nothing changes |

Fragments in `order` go first, in that order; the rest follow alphabetically. The same state always
gives the same string, so the WMS URL and its cache stay stable. `subscribe` and `getSnapshot` fit
React's `useSyncExternalStore`.

| Helper | Output |
|---|---|
| `quoteIdentifier('año')` | `"año"`; simple names stay bare, reserved words are quoted |
| `quoteLiteral("O'Hara")` | `'O''Hara'`; numbers, booleans and dates as CQL literals |
| `escapeLike('50%')` | `50\%`, for `LIKE` and `ILIKE` patterns |
| `and(a, b)`, `or(a, b)`, `not(a)` | Wrapped in parentheses, empty parts dropped, `null` when nothing is left |
| `inList('code', ['A', 'B'])` | `code IN ('A', 'B')`, `=` for one value, `null` for none |
| `between('pop', 10, 2)` | `pop BETWEEN 2 AND 10` |
| `bbox('geom', box, 'EPSG:4326')` | `BBOX(geom, …, 'EPSG:4326')` with up to 6 decimals |

Keep dates of a `TIME` dimension out of the CQL: send them as `TIME` (`wmsFeatureInfo` has a `time`
field). GeoServer applies the default time when `TIME` is missing, even if the CQL filters by date.

## Known limitations

- WMS capabilities are read for version 1.3.0 only, and they need `DOMParser`: browsers have it; in
  Node, provide one (for example from happy-dom or linkedom) on `globalThis`.
- `BoundingBox` extents are returned as the server writes them; in WMS 1.3.0, `EPSG:4326` is
  latitude first.
- WFS requests are 2.0.0 with JSON output, and `wmsFeatureInfo` reads JSON only; GML is not parsed.
- `wpsUnique` depends on the GeoServer `gs:PagedUnique` process.
- The cache lives in memory, per client.
- There is no demo yet, and no image in this README: the first demo comes with the map adapters.

## Development

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

The tests run on Vitest with happy-dom against trimmed real answers from a public GeoServer and NASA
GIBS in `test/fixtures/`.

A `vX.Y.Z` tag that matches `package.json` runs `release.yml`: tests, the GitHub release with that
version's changelog section, npm with provenance and GitHub Packages.

## Contributing

Issues are welcome. Open one before sending a pull request.

## License

AGPL-3.0-only © GHEgar
