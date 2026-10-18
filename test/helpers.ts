import { readFileSync } from 'node:fs';

export const fixture = (name: string): string => readFileSync(`${process.cwd()}/test/fixtures/${name}`, 'utf8');

export interface Recorded {
    url: string;
    init: RequestInit;
}

export type Responder = (url: string, init: RequestInit) => Response | Promise<Response>;

export const mockFetch = (responder: Responder): { fetch: typeof fetch; calls: Recorded[] } => {
    const calls: Recorded[] = [];
    const fetcher = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
        const url = String(input);
        calls.push({ url, init });
        return responder(url, init);
    };
    return { fetch: fetcher as typeof fetch, calls };
};

export const text = (body: string, status = 200, type = 'text/xml'): Response =>
    new Response(body, { status, headers: { 'Content-Type': type } });

export const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const query = (url: string): Record<string, string> =>
    Object.fromEntries(new URL(url).searchParams.entries());
