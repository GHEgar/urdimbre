import { and, bbox as bboxCql } from '../cql/logic.js';
import { OgcError } from './errors.js';
import type { FeatureField, FeatureSchema, GetFeatureRequest, SortKey } from './types.js';

const GEOMETRY_TYPES = new Set([
    'geometry', 'point', 'multipoint', 'linestring', 'multilinestring', 'curve', 'multicurve',
    'polygon', 'multipolygon', 'surface', 'multisurface', 'geometrycollection',
]);

const localName = (type: string): string => (type.split(':').pop() ?? type).replace(/PropertyType$/, '');

export const isGeometryType = (type: string): boolean => GEOMETRY_TYPES.has(localName(type).toLowerCase());

export const sortParam = (sortBy: string | readonly SortKey[]): string | null => {
    if (typeof sortBy === 'string') return sortBy.trim() || null;
    const keys = sortBy.map(key => `${key.field} ${key.direction === 'desc' ? 'DESC' : 'ASC'}`);
    return keys.length === 0 ? null : keys.join(',');
};

const wfsBase = (request: string): Record<string, unknown> => ({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: request });

export const describeParams = (typeName: string): Record<string, unknown> => ({
    ...wfsBase('DescribeFeatureType'),
    TYPENAMES: typeName,
    OUTPUTFORMAT: 'application/json',
});

const filterParams = (request: GetFeatureRequest): Record<string, unknown> => {
    const box = request.bbox ?? null;
    if (!box) return { CQL_FILTER: request.cql };
    if (!request.cql) return { BBOX: request.srsName ? [...box, request.srsName] : box };
    if (!request.geometryName) {
        throw new TypeError('GeoServer does not accept BBOX together with CQL_FILTER: pass geometryName so the box joins the CQL');
    }
    return { CQL_FILTER: and(request.cql, bboxCql(request.geometryName, box, request.srsName ?? undefined)) };
};

export const getFeatureParams = (request: GetFeatureRequest, hits = false): Record<string, unknown> => {
    const sortBy = request.sortBy ? sortParam(request.sortBy) : null;
    if (!hits && request.startIndex !== undefined && !sortBy) {
        throw new TypeError('startIndex needs sortBy: GeoServer cannot page reliably without a stable order');
    }
    return {
        ...request.params,
        ...wfsBase('GetFeature'),
        TYPENAMES: request.typeName,
        ...filterParams(request),
        SRSNAME: request.srsName,
        PROPERTYNAME: hits ? undefined : request.propertyNames,
        SORTBY: hits ? undefined : sortBy,
        STARTINDEX: hits ? undefined : request.startIndex,
        COUNT: hits ? undefined : request.count,
        OUTPUTFORMAT: hits ? undefined : request.outputFormat ?? 'application/json',
        RESULTTYPE: hits ? 'hits' : undefined,
    };
};

interface DescribeProperty {
    name?: string;
    type?: string;
    localType?: string;
    nillable?: boolean;
}

export const parseSchema = (typeName: string, json: unknown): FeatureSchema => {
    const featureTypes = (json as { featureTypes?: { properties?: DescribeProperty[] }[] } | null)?.featureTypes;
    const properties = featureTypes?.[0]?.properties;
    if (!Array.isArray(properties)) throw new OgcError(`DescribeFeatureType returned no properties for ${typeName}`);
    let geometry: FeatureSchema['geometry'] = null;
    const fields: FeatureField[] = [];
    for (const property of properties) {
        if (!property.name) continue;
        const type = property.localType ?? localName(property.type ?? 'string');
        if (geometry === null && (isGeometryType(type) || isGeometryType(property.type ?? ''))) {
            geometry = { name: property.name, type };
            continue;
        }
        fields.push({ name: property.name, type, nillable: property.nillable ?? true });
    }
    return { typeName, geometry, fields };
};

export const parseHits = (body: string): number | null => {
    const match = body.match(/\bnumberMatched="(\d+)"/) ?? body.match(/\bnumberOfFeatures="(\d+)"/);
    return match ? Number(match[1]) : null;
};
