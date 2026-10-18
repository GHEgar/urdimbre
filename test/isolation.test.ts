import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const root = process.cwd();

const read = (folder: string): [string, string][] =>
    readdirSync(`${root}/${folder}`, { withFileTypes: true }).flatMap(entry => (entry.isDirectory()
        ? read(`${folder}/${entry.name}`)
        : [[`${folder}/${entry.name}`, readFileSync(`${root}/${folder}/${entry.name}`, 'utf8')] as [string, string]]));

const sources = (...folders: string[]): [string, string][] => folders.flatMap(read);

const imports = (source: string): { specifier: string; typeOnly: boolean }[] =>
    [...source.matchAll(/^(import|export)\s+(type\s+)?[^;]*?from\s+'([^']+)'/gms)].map(match => ({ specifier: match[3] as string, typeOnly: match[2] !== undefined }));

const external = (folders: string[], allowed: (specifier: string, typeOnly: boolean) => boolean): string[] =>
    sources(...folders).flatMap(([file, source]) => imports(source)
        .filter(({ specifier }) => !specifier.startsWith('./') && !specifier.startsWith('../'))
        .filter(({ specifier, typeOnly }) => !allowed(specifier, typeOnly))
        .map(({ specifier }) => `${file}: ${specifier}`));

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('isolation', () => {
    it('keeps ogc, cql, catalog and arbiter free of any package', () => {
        expect(external(['src/cql', 'src/ogc', 'src/shared', 'src/catalog', 'src/arbiter'], () => false)).toEqual([]);
    });

    it('lets the OpenLayers adapter import only ol', () => {
        expect(external(['src/ol'], specifier => specifier.startsWith('ol/'))).toEqual([]);
    });

    it('lets the MapLibre adapter use maplibre-gl only as types', () => {
        expect(external(['src/maplibre'], (specifier, typeOnly) => specifier === 'maplibre-gl' && typeOnly)).toEqual([]);
        const runtime = sources('src/maplibre').filter(([, source]) => /import\s*\(\s*'maplibre-gl'|require\(/.test(source));
        expect(runtime).toEqual([]);
    });

    it('never imports the adapters from the root entry or the core', () => {
        const core = sources('src/cql', 'src/ogc', 'src/shared', 'src/catalog', 'src/arbiter')
            .flatMap(([file, source]) => imports(source).filter(({ specifier }) => /\/(ol|maplibre)\//.test(specifier)).map(({ specifier }) => `${file}: ${specifier}`));
        const entry = imports(readFileSync(`${root}/src/index.ts`, 'utf8')).map(({ specifier }) => specifier);
        expect(core).toEqual([]);
        expect(entry).toEqual(['./arbiter/index.js', './catalog/index.js', './cql/index.js', './ogc/index.js']);
    });

    it('never names window or document', () => {
        const offenders = sources('src').filter(([, source]) => /\b(window|document)\s*[.[]/.test(source)).map(([file]) => file);
        expect(offenders).toEqual([]);
    });

    it('loads without a DOM and asks for DOMParser only when parsing', async () => {
        vi.stubGlobal('DOMParser', undefined);
        vi.stubGlobal('window', undefined);
        vi.stubGlobal('document', undefined);
        const module = await import('../src/index.js');
        expect(typeof module.createOgcClient).toBe('function');
        expect(typeof module.defineCatalog).toBe('function');
        expect(typeof module.createArbiter).toBe('function');
        expect(() => module.parseWmsCapabilities('<WMS_Capabilities/>')).toThrow(/DOMParser is not available/);
    });

    it('keeps every source and test file under 300 lines', () => {
        const long = sources('src', 'test').filter(([file]) => /\.ts$/.test(file)).filter(([, source]) => source.split('\n').length > 300).map(([file]) => file);
        expect(long).toEqual([]);
    });
});
