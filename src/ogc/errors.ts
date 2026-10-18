export interface OgcErrorDetails {
    status?: number | null;
    code?: string | null;
    url?: string | null;
}

export class OgcError extends Error {
    readonly status: number | null;
    readonly code: string | null;
    readonly url: string | null;

    constructor(message: string, details: OgcErrorDetails = {}) {
        super(message);
        this.name = 'OgcError';
        this.status = details.status ?? null;
        this.code = details.code ?? null;
        this.url = details.url ?? null;
    }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decode = (text: string): string => text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name] ?? '')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();

const EXCEPTION_ROOT = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:[\w-]+:)?(?:ServiceExceptionReport|ExceptionReport)\b/;

export const isExceptionReport = (body: string): boolean => EXCEPTION_ROOT.test(body);

export const readException = (body: string): { message: string; code: string | null } | null => {
    const match = body.match(/<(?:[\w-]+:)?ExceptionText>([\s\S]*?)<\/(?:[\w-]+:)?ExceptionText>/)
        ?? body.match(/<(?:[\w-]+:)?ServiceException\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?ServiceException>/);
    const code = body.match(/\b(?:exceptionCode|code)="([^"]*)"/)?.[1] ?? null;
    if (match) return { message: decode(match[1] as string), code };
    if (isExceptionReport(body)) return { message: 'The server answered with an exception report', code };
    return null;
};
