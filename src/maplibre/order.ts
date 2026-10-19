export type Move = [id: string, beforeId: string | undefined];

const increasing = (positions: readonly number[]): Set<number> => {
    const length = positions.map(() => 0);
    const previous = positions.map(() => -1);
    let best = -1;
    positions.forEach((position, index) => {
        if (position < 0) return;
        length[index] = 1;
        for (let before = 0; before < index; before += 1) {
            const candidate = positions[before] as number;
            if (candidate < 0 || candidate >= position || (length[before] as number) + 1 <= (length[index] as number)) continue;
            length[index] = (length[before] as number) + 1;
            previous[index] = before;
        }
        if (best < 0 || (length[index] as number) > (length[best] as number)) best = index;
    });
    const kept = new Set<number>();
    for (let index = best; index >= 0; index = previous[index] as number) kept.add(index);
    return kept;
};

export const planMoves = (wanted: readonly string[], style: readonly string[], beforeId?: string): Move[] => {
    const position = new Map(style.map((id, index) => [id, index]));
    const limit = beforeId === undefined ? Infinity : (position.get(beforeId) ?? Infinity);
    const positions = wanted.map(id => {
        const at = position.get(id);
        return at === undefined || at > limit ? -1 : at;
    });
    const kept = increasing(positions);
    if (kept.size === wanted.length) return [];
    const highest = Math.max(-1, ...wanted.map(id => position.get(id) ?? -1));
    const top = beforeId ?? style.slice(highest + 1).find(id => !wanted.includes(id));
    const moves: Move[] = [];
    for (let index = wanted.length - 1; index >= 0; index -= 1) {
        if (!kept.has(index)) moves.push([wanted[index] as string, wanted[index + 1] ?? top]);
    }
    return moves;
};

export const nextAbove = (style: readonly string[], own: readonly string[]): string | undefined => {
    const last = Math.max(-1, ...own.map(id => style.indexOf(id)));
    if (last < 0) return undefined;
    return style.slice(last + 1).find(id => !own.includes(id));
};
