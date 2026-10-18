# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado con
[SemVer](https://semver.org/lang/es/).

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
