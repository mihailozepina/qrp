/**
 * scale/index.js — micro scales for charts: linear, ordinal, quantize, ticks,
 * plus a colourblind-safe categorical palette. Pure, zero-dep — the math every
 * visualization re-derives. Pairs with spark. Deliberately tiny (this is not
 * d3-scale); it covers the 80% a dashboard chart needs.
 */

/**
 * Map a numeric domain [d0,d1] onto a range [r0,r1]. `linear([0,100],[0,300])(50)`
 * → 150. `{ clamp: true }` keeps the output inside the range.
 */
export const linear = (domain, range, { clamp = false } = {}) => {
	const [d0, d1] = domain;
	const [r0, r1] = range;
	const span = d1 - d0;

	return (x) => {
		const t = span === 0 ? 0 : (x - d0) / span;
		const u = clamp ? Math.max(0, Math.min(1, t)) : t;

		return r0 + u * (r1 - r0);
	};
};

/**
 * Assign values to a cycling range (e.g. series → colour), lazily: each new
 * value gets the next slot. `const colour = ordinal(palette); colour("cpu")`.
 */
export const ordinal = (range, domain = []) => {
	const index = new Map(domain.map((value, i) => [value, i]));
	let next = domain.length;

	return (value) => {
		if(!index.has(value)) {
			index.set(value, next);
			next += 1;
		}

		return range[index.get(value) % range.length];
	};
};

/**
 * Bucket a numeric domain into `range.length` bands (e.g. value → colour step).
 * `quantize([0,1],["low","mid","high"])(0.9)` → "high".
 */
export const quantize = (domain, range) => {
	const n = range.length;
	const toBand = linear(domain, [0, n], { clamp: true });

	return (x) => range[Math.min(n - 1, Math.max(0, Math.floor(toBand(x))))];
};

/** Evenly spaced tick values across [d0,d1] (count+1 points, ends included). */
export const ticks = (domain, count = 5) => {
	const [d0, d1] = domain;
	const step = (d1 - d0) / count;

	return Array.from({ length: count + 1 }, (_, i) => d0 + i * step);
};

/**
 * Round a domain out to whole "nice" steps (1, 2, 2.5 or 5 × 10^n) so axis ticks
 * land on round numbers: `nice([3, 97], 5)` → `{ domain: [0, 100], step: 20,
 * ticks: [0, 20, 40, 60, 80, 100] }`. Include zero yourself if the chart needs it
 * (`nice([Math.min(0, lo), hi])`).
 */
export const nice = (domain, count = 5) => {
	const [lo, hi] = domain;
	const span = hi - lo || Math.abs(lo) || 1;
	const raw = span / Math.max(1, count);
	const power = 10 ** Math.floor(Math.log10(raw));
	const step = [1, 2, 2.5, 5, 10].find((unit) => raw / power <= unit) * power;
	// Round to the step's precision so 0.2 × 3 reads 0.6, not 0.6000000000000001.
	const digits = Math.max(0, 1 - Math.floor(Math.log10(step)));
	const clean = (value) => Number(value.toFixed(digits));
	const start = clean(Math.floor(lo / step) * step);
	const end = clean(Math.max(Math.ceil(hi / step) * step, start + step));
	const steps = Math.round((end - start) / step);

	return { domain: [start, end], step: clean(step), ticks: Array.from({ length: steps + 1 }, (_, i) => clean(start + i * step)) };
};

/**
 * Okabe–Ito colourblind-safe categorical palette (8 hues). Feed it to `ordinal`
 * so a chart's series get stable, accessible colours instead of random hex.
 */
export const palette = [
	"#0072B2", "#E69F00", "#009E73", "#D55E00",
	"#56B4E9", "#CC79A7", "#F0E442", "#999999"
];
