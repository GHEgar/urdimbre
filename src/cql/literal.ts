const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const RESERVED = new Set([
    'AFTER', 'AND', 'BBOX', 'BEFORE', 'BETWEEN', 'BEYOND', 'CONTAINS', 'CROSSES', 'DISJOINT', 'DOES',
    'DURING', 'DWITHIN', 'EQUALS', 'EXCLUDE', 'EXISTS', 'FALSE', 'ID', 'ILIKE', 'IN', 'INCLUDE',
    'INTERSECTS', 'IS', 'LIKE', 'NOT', 'NULL', 'OR', 'OVERLAPS', 'RELATE', 'TEQUALS', 'TOUCHES', 'TRUE',
    'WITHIN',
]);

export const quoteIdentifier = (name: string): string => {
    if (name === '') throw new TypeError('An identifier cannot be empty');
    if (SIMPLE_IDENTIFIER.test(name) && !RESERVED.has(name.toUpperCase())) return name;
    return `"${name.replace(/"/g, '""')}"`;
};

export const quoteString = (value: string): string => `'${value.replace(/'/g, "''")}'`;

export const quoteLiteral = (value: string | number | boolean | Date): string => {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
        return Object.is(value, -0) ? '0' : String(value);
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) throw new RangeError('Invalid date');
        return quoteString(value.toISOString());
    }
    return quoteString(value);
};

export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, match => `\\${match}`);
