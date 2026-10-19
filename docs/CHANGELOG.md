# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado con
[SemVer](https://semver.org/lang/es/).

## [0.4.0] - 2026-10-19

### Agregado

- `LayerDef.metadata`: objeto libre para la app (miniaturas, piel); se valida que sea objeto, no se
  revisa por dentro, se congela y entra en el `hash`.
- `LayerDef.opacity` (0–1): opacidad inicial que `createLayerState` usa si el estado inicial no trae
  otra; `applyLayerState` la restituye a las capas que la URL deja fuera.
- `urdimbre/legend`: `classFilterCql(field, classes, visible, { lastInclusive })` convierte las clases
  visibles (`{ min, max }`, `LegendClass` o `{ breaks }`) en un fragmento CQL (`null` con todas,
  `EXCLUDE` sin ninguna) y `classesFromCql` reconstruye la selección o da `null` si el CQL es ajeno.
- `urdimbre/cql`: `EXCLUDE` y la opción `axisOrder` (`'lonlat'` por omisión, igual que antes, o
  `'latlon'`) en `bbox`, con el orden de ejes de `EPSG:4326` en GeoServer documentado.
- `identify`: capas `geojson`, `vector-tiles` y `pmtiles` con `identify` en el mismo iterable y antes
  que el WMS. `query(layerId, at, tolerance)` las consulta en el motor y, si da `null`, el GeoJSON en
  línea se prueba localmente por punto, línea y polígono con `tolerance` en píxeles (5) en
  `EPSG:3857` o `EPSG:4326`. `DEFAULT_TOLERANCE` y el tipo `IdentifyQuery`.
- `urdimbre/maplibre`: `renderedQuery(map)`, el `query` de `identify` sobre `queryRenderedFeatures`
  sin duplicados por tesela, y `styleLayersOf(map, id)`.

### Cambiado

- `bindMapLibre`: con `getLayersOrder` (opcional en `MapLibreMapLike`) solo mueve sus capas fuera de
  orden y deja en su sitio las ajenas intercaladas (deck.gl); una fuente reemplazada vuelve a su
  lugar. Sin `getLayersOrder` se comporta como antes.

### Corregido

- `bindMapLibre` ya no llama `setTiles` si la fuente ya tiene exactamente esa plantilla.

## [0.3.0] - 2026-10-19

### Agregado

- `urdimbre/state`: `encodeState` y `decodeState` con un formato compacto y legible (`v` vista,
  `l` capas en orden con `!` oculta, `:opacidad` y `~dimensión=valor`, `f` fragmentos CQL por capa y
  nombre en base64url, `t` herramienta y el resto de la consulta en `extra`); ids desconocidos y
  partes mal formadas se ignoran sin lanzar.
- `bindUrl`: aplica la URL inicial, escribe los movimientos del mapa con `replaceState` y debounce
  (250 ms) y los cambios de capas o herramienta con `pushState`, y aplica `popstate` sin reescribir.
  Toma `history`, `location` y el destino de `popstate` de las opciones o de `globalThis` al llamarse.
- `readLayerState` y `applyLayerState`: leen y aplican el estado de capas con los fragmentos de cada
  compositor CQL.
- `urdimbre/legend`: `LegendEntry` (`classes`, `ramp`, `image`, `symbols`); `legendFromWms` y
  `legendUrlFromWms` con un `GetLegendGraphic` canónico que lleva el `TIME`, las dimensiones y el
  `CQL_FILTER` de la capa; `legendFromClasses` para clases `{ min, max }` o `{ breaks }` con colores y
  conteos; `legendFromMapLibreStyle` para `step`, `interpolate`, `match` y colores simples;
  `legendForState` con entradas propias por capa.
- `urdimbre/identify`: `identify`, iterable asíncrono que agrupa por servicio y valores de dimensión
  un `GetFeatureInfo` con `QUERY_LAYERS`, `TIME` y un `CQL_FILTER` por capa, entrega cada respuesta en
  cuanto llega, aísla los errores por servicio, marca `more` al llegar a `featureCount` y se cancela
  con el `signal` o al salir del ciclo.
- El paquete raíz reexporta `state`, `legend` e `identify`.

## [0.2.0] - 2026-10-18

### Agregado

- `urdimbre/catalog`: `defineCatalog` valida el catálogo (id único, `kind` coherente con sus
  servicios, campos desconocidos) con `CatalogError` y la ruta del campo, y calcula un `hash` FNV-1a
  estable sobre el JSON con llaves ordenadas.
- `enrichFromCapabilities`: completa título, resumen, bbox, dimensiones y `legendUrl` desde un solo
  GetCapabilities por servicio, sin pisar lo declarado.
- `createLayerState`: capas activas, orden, opacidad, visibilidad, dimensiones y un compositor CQL por
  capa, con `select` que solo avisa cuando cambia lo seleccionado.
- `describe` y `describeState`: descripción pura y determinista de cada capa, con WMS en teselas por
  omisión, dimensiones como `TIME`, `ELEVATION` o `DIM_<NOMBRE>` aparte del CQL, `zIndex` por bandas y
  `key` con la URL canónica de la fuente.
- `urdimbre/arbiter`: `createArbiter`, una herramienta con el clic a la vez, clic a «identificar» sin
  herramienta, Escape y `onEscape` para colgarse de una pila externa.
- `urdimbre/ol`: `bindOl`, reconciliador con diff por `id` que solo hace `updateParams`, `setOpacity`,
  `setZIndex` y `setVisible` cuando la fuente no cambia, y `bindArbiter` sobre `singleclick`.
- `urdimbre/maplibre`: `bindMapLibre` sobre la interfaz estructural `MapLibreMapLike`, sin importar
  `maplibre-gl` en tiempo de ejecución, y `bindArbiter` sobre `click`.
- `ol` (`>=10`) y `maplibre-gl` (`>=6`) como peers opcionales.

## [0.1.0] - 2026-10-18

### Agregado

- `urdimbre/ogc`: `createOgcClient` con `fetch` inyectable, cabeceras, `AbortSignal` en todos los
  métodos y caché en memoria por URL canónica, con TTL y peticiones en vuelo compartidas.
- `canonicalUrl`: parámetros en mayúsculas y en orden alfabético, sin vacíos, `BBOX` con hasta 6
  decimales, booleanos como `true`/`false` y la consulta de la URL base fusionada.
- WMS 1.3.0: `wmsCapabilities` y `parseWmsCapabilities` sobre `DOMParser`, con título, resumen, CRS,
  bbox, estilos con `LegendURL` y dimensiones heredadas por las capas hijas; `findLayer` y
  `flattenLayers`; `wmsFeatureInfo` en GeoJSON con `TIME` como parámetro propio.
- WFS 2.0.0: `wfsDescribe`, `wfsGetFeature`, `wfsHits` y `wfsPages`, en JSON, con `POST` cuando la URL
  pasa de `maxUrl` (2000 por omisión) y error claro ante `startIndex` sin `sortBy`.
- WPS: `wpsUnique` sobre `gs:PagedUnique`.
- `OgcError` con el mensaje, el código y el estado del servidor, también para el `ServiceException` que
  GeoServer responde con estado 200.
- `urdimbre/cql`: `createCqlComposer` con fragmentos con nombre, orden estable, snapshot estable y una
  notificación por cambio; `quoteIdentifier`, `quoteLiteral`, `escapeLike`, `and`, `or`, `not`,
  `inList`, `between` y `bbox`.
