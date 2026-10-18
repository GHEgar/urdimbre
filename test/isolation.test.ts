import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const folders = ['src/cql', 'src/ogc', 'src/shared'];

const sources = (): [string, string][] => folders.flatMap(folder =>
    readdirSync(`${process.cwd()}/${folder}`).map(file => [`${folder}/${file}`, readFileSync(`${process.cwd()}/${folder}/${file}`, 'utf8')] as [string, string]));

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('isolation', () => {
    it('imports only relative modules', () => {
        const offenders = sources().flatMap(([file, source]) => [...source.matchAll(/from\s+'([^']+)'/g)]
            .map(match => match[1] as string)
            .filter(specifier => !specifier.startsWith('./') && !specifier.startsWith('../'))
            .map(specifier => `${file}: ${specifier}`));
        expect(offenders).toEqual([]);
    });

    it('never names window or document', () => {
        const offenders = sources().filter(([, source]) => /\b(window|document)\s*[.[]/.test(source)).map(([file]) => file);
        expect(offenders).toEqual([]);
    });

    it('loads without a DOM and asks for DOMParser only when parsing', async () => {
        vi.stubGlobal('DOMParser', undefined);
        vi.stubGlobal('window', undefined);
        vi.stubGlobal('document', undefined);
        const module = await import('../src/index.js');
        expect(typeof module.createOgcClient).toBe('function');
        expect(() => module.parseWmsCapabilities('<WMS_Capabilities/>')).toThrow(/DOMParser is not available/);
    });

    it('keeps every source file under 300 lines', () => {
        const long = sources().filter(([, source]) => source.split('\n').length > 300).map(([file]) => file);
        expect(long).toEqual([]);
    });
});
