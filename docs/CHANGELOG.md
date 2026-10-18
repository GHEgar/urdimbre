# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado con
[SemVer](https://semver.org/lang/es/).

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
