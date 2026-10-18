import { canonicalUrl } from './canonical.js';

const XML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

export const escapeXml = (value: string): string => value.replace(/[&<>"']/g, char => XML_ENTITIES[char] ?? char);

export const featuresReference = (typeName: string, cql: string | null | undefined): string =>
    canonicalUrl('http://geoserver/wfs', { SERVICE: 'WFS', VERSION: '1.0.0', REQUEST: 'GetFeature', TYPENAME: typeName, CQL_FILTER: cql });

const literalInput = (name: string, value: string): string =>
    `<wps:Input><ows:Identifier>${name}</ows:Identifier><wps:Data><wps:LiteralData>${escapeXml(value)}</wps:LiteralData></wps:Data></wps:Input>`;

export const pagedUniqueXml = (typeName: string, field: string, cql?: string | null, limit?: number): string => [
    '<wps:Execute version="1.0.0" service="WPS" xmlns:wps="http://www.opengis.net/wps/1.0.0"',
    ' xmlns:ows="http://www.opengis.net/ows/1.1" xmlns:xlink="http://www.w3.org/1999/xlink">',
    '<ows:Identifier>gs:PagedUnique</ows:Identifier><wps:DataInputs>',
    '<wps:Input><ows:Identifier>features</ows:Identifier>',
    `<wps:Reference mimeType="text/xml" xlink:href="${escapeXml(featuresReference(typeName, cql))}" method="GET"/>`,
    '</wps:Input>',
    literalInput('fieldName', field),
    limit === undefined ? '' : literalInput('maxFeatures', String(limit)),
    '</wps:DataInputs><wps:ResponseForm><wps:RawDataOutput mimeType="application/json">',
    '<ows:Identifier>result</ows:Identifier></wps:RawDataOutput></wps:ResponseForm></wps:Execute>',
].join('');

export const parseUnique = (json: unknown): string[] | null => {
    const values = (json as { values?: unknown } | null)?.values;
    if (!Array.isArray(values)) return null;
    return values.filter(value => value !== null && value !== undefined).map(String);
};
