import { OgcError } from './errors.js';

export const parseXml = (xml: string): Document => {
    const Parser = globalThis.DOMParser;
    if (typeof Parser !== 'function') throw new OgcError('DOMParser is not available: run in a browser or provide a DOM implementation');
    const parsed = new Parser().parseFromString(xml.replace(/^\uFEFF?\s*<\?xml[^>]*\?>/, ''), 'application/xml');
    const root = parsed.documentElement;
    if (!root || root.localName === 'parsererror' || parsed.getElementsByTagName('parsererror').length > 0) {
        throw new OgcError('The response is not valid XML');
    }
    return parsed;
};

export const childElements = (parent: Element, name?: string): Element[] => {
    const found: Element[] = [];
    for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType !== 1) continue;
        const element = node as Element;
        if (name === undefined || element.localName === name) found.push(element);
    }
    return found;
};

export const childElement = (parent: Element, name: string): Element | null => childElements(parent, name)[0] ?? null;

export const childText = (parent: Element, name: string): string | null => {
    const text = childElement(parent, name)?.textContent?.trim();
    return text ? text : null;
};

export const attribute = (element: Element, name: string): string | null => {
    const direct = element.getAttribute(name);
    if (direct !== null) return direct;
    for (const item of Array.from(element.attributes)) {
        if (item.localName === name) return item.value;
    }
    return null;
};
