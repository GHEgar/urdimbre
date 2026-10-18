export const formatNumber = (value: number, decimals?: number): string => {
    if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
    const rounded = decimals === undefined ? value : Number(value.toFixed(decimals));
    return Object.is(rounded, -0) ? '0' : String(rounded);
};

export const BBOX_DECIMALS = 6;
