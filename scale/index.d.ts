/**
 * @module scale
 * Micro scales for charts — `linear`, `ordinal`, `quantize`, `ticks`, `nice`, and a
 * colourblind-safe categorical `palette`. Pure, zero-dep; pairs with `spark`.
 */

/** Map numeric domain [d0,d1] onto range [r0,r1]. `{ clamp }` bounds the output. */
export function linear(domain: readonly [number, number], range: readonly [number, number], opts?: { clamp?: boolean }): (x: number) => number;
/** Assign values to a cycling range (series → colour), lazily by first-seen order. */
export function ordinal<T>(range: readonly T[], domain?: readonly unknown[]): (value: unknown) => T;
/** Bucket a numeric domain into `range.length` bands. */
export function quantize<T>(domain: readonly [number, number], range: readonly T[]): (x: number) => T;
/** Evenly spaced tick values across [d0,d1] (count+1 points, ends included). */
export function ticks(domain: readonly [number, number], count?: number): number[];
/**
 * Round a domain out to whole "nice" steps (1, 2, 2.5 or 5 × 10^n) so ticks land
 * on round numbers. `nice([3, 97], 5)` → `{ domain: [0, 100], step: 20, ticks: [0, 20, …, 100] }`.
 */
export function nice(domain: readonly [number, number], count?: number): { domain: [number, number]; step: number; ticks: number[] };
/** Okabe–Ito colourblind-safe categorical palette (8 hues). */
export const palette: string[];
