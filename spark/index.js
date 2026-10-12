/**
 * spark/index.js — data in, `<svg>` out. A charting *primitive*, not a charting
 * library: pass a series, get back a reactive `el()` SVG (line / area / bar). No
 * tooltips, no legends — but `project()` hands back the same screen points the
 * marks are drawn from, so a chart built on spark can hit-test its own cursor.
 * The marks read their data through a thunk, so passing `() => series` makes the
 * chart live. Several sparks share axes through `xDomain`/`yDomain`, stack with
 * `stack`, and sit side by side as grouped bars with `group`. (Enabled by qrp's
 * SVG-namespace-aware `el`.)
 */

import { el } from "../qrp/index.js";
import { linear } from "../scale/index.js";

const accessor = (spec, fallback) => {
	if(typeof spec === "function") { return spec; }
	if(spec == null) { return fallback; }

	return (d) => d[spec];
};

const round = (n) => n.toFixed(2);

const pt = ([px, py]) => `${round(px)},${round(py)}`;

// --- curves -----------------------------------------------------------------
// The interpolations d3-shape offers: linear, step, natural (natural cubic
// spline) and monotone (monotone in x — never overshoots between points).

const linearPath = (points) => "M" + points.map(pt).join(" L");

const stepPath = (points) => points.slice(1).reduce((d, p, i) => {
	const mid = (points[i][0] + p[0]) / 2;

	return `${d} H${round(mid)} V${round(p[1])} H${round(p[0])}`;
}, `M${pt(points[0])}`);

// Natural cubic spline control points for one coordinate: a tridiagonal solve,
// as a forward sweep then back substitution.
const naturalControls = (x) => {
	const n = x.length - 1;
	const rows = Array.from({ length: n }, (_, i) => {
		if(i === 0) { return { a: 0, b: 2, r: x[0] + 2 * x[1] }; }
		if(i === n - 1) { return { a: 2, b: 7, r: 8 * x[n - 1] + x[n] }; }

		return { a: 1, b: 4, r: 4 * x[i] + 2 * x[i + 1] };
	});
	const swept = rows.reduce((acc, row, i) => {
		if(i === 0) { return [row]; }

		const m = row.a / acc[i - 1].b;

		return acc.concat([{ a: row.a, b: row.b - m, r: row.r - m * acc[i - 1].r }]);
	}, []);
	const first = swept.reduceRight((acc, row, i) => [i === n - 1 ? row.r / row.b : (row.r - acc[0]) / row.b].concat(acc), []);
	const second = first.map((_, i) => (i === n - 1 ? (x[n] + first[n - 1]) / 2 : 2 * x[i + 1] - first[i + 1]));

	return [first, second];
};

const naturalPath = (points) => {
	const [ax, bx] = naturalControls(points.map((p) => p[0]));
	const [ay, by] = naturalControls(points.map((p) => p[1]));

	return points.slice(1).reduce((d, p, i) => `${d} C${pt([ax[i], ay[i]])} ${pt([bx[i], by[i]])} ${pt(p)}`, `M${pt(points[0])}`);
};

const sign = (n) => (n < 0 ? -1 : 1);

const monotonePath = (points) => {
	const n = points.length;
	const secant = (i) => (points[i + 1][1] - points[i][1]) / ((points[i + 1][0] - points[i][0]) || 1);
	const interior = (i) => {
		const h0 = points[i][0] - points[i - 1][0];
		const h1 = points[i + 1][0] - points[i][0];
		const s0 = secant(i - 1);
		const s1 = secant(i);
		const p = (s0 * h1 + s1 * h0) / ((h0 + h1) || 1);

		return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
	};
	const inner = points.map((_, i) => (i === 0 || i === n - 1 ? 0 : interior(i)));
	const tangent = inner.map((t, i) => {
		if(i === 0) { return (3 * secant(0) - inner[1]) / 2; }
		if(i === n - 1) { return (3 * secant(n - 2) - inner[n - 2]) / 2; }

		return t;
	});

	return points.slice(1).reduce((d, p, i) => {
		const p0 = points[i];
		const dx = (p[0] - p0[0]) / 3;

		return `${d} C${pt([p0[0] + dx, p0[1] + dx * tangent[i]])} ${pt([p[0] - dx, p[1] - dx * tangent[i + 1]])} ${pt(p)}`;
	}, `M${pt(points[0])}`);
};

const CURVES = { linear: linearPath, step: stepPath, natural: naturalPath, monotone: monotonePath };

/** Path data through screen points with the named interpolation ("" for none). */
const curvePath = (points, type) => {
	if(!points.length) { return ""; }
	if(points.length === 1) { return `M${pt(points[0])}`; }

	// The splines need three points; with two they are a straight line anyway.
	const draw = points.length < 3 && type !== "step" ? linearPath : CURVES[type] || linearPath;

	return draw(points);
};

// --- geometry ---------------------------------------------------------------

// A scale over [lo, hi] onto `range`; a degenerate extent (a single point, or a
// perfectly flat series) maps to the MIDDLE of the range instead of the low
// edge — so one snapshot renders centered, not pinned to the corner.
const axisScale = ([lo, hi], range) => (lo === hi ? () => (range[0] + range[1]) / 2 : linear([lo, hi], range));

const extent = (values) => [Math.min(...values), Math.max(...values)];

const readDomain = (domain) => (typeof domain === "function" ? domain() : domain);

// `stack` is the baseline each value sits on: an array aligned with the data, or
// an accessor (d, i) => number (reactive when it reads state).
const baselineOf = (opts) => {
	if(typeof opts.stack === "function") { return opts.stack; }
	if(Array.isArray(opts.stack)) { return (_d, i) => opts.stack[i] || 0; }

	return null;
};

const sizeOf = (opts) => ({
	width: opts.width === undefined ? 240 : opts.width,
	height: opts.height === undefined ? 60 : opts.height,
	padding: opts.padding === undefined ? 2 : opts.padding
});

/**
 * Screen geometry for a series under the options — the one source of truth for
 * both the drawn marks and `project()`.
 */
const geometry = (data, opts) => {
	const kind = opts.kind || "line";
	const { width, height, padding } = sizeOf(opts);
	const getX = accessor(opts.x, (_d, i) => i);
	const getY = accessor(opts.y, (d) => (typeof d === "number" ? d : d.y));
	const stackOf = baselineOf(opts);
	const base = opts.base;

	if(!data.length) { return []; }

	const lows = data.map((d, i) => (stackOf ? stackOf(d, i) : base));
	const highs = data.map((d, i) => getY(d, i) + (stackOf ? stackOf(d, i) : 0));
	const yValues = highs.concat(lows.filter((v) => v !== undefined));
	const fixedY = readDomain(opts.yDomain);
	const yRange = [height - padding, padding];   // svg y grows down

	if(kind === "bar") {
		// Bars grow from zero unless given a base or a stack, so zero is in range.
		const zero = base === undefined ? 0 : base;
		const yScale = fixedY ? axisScale(fixedY, yRange) : linear(extent(yValues.concat([zero])), yRange);
		const bandWidth = (width - padding * 2) / data.length;
		const gap = opts.gap === undefined ? 0.2 : opts.gap;
		const [slot, slots] = opts.group || [0, 1];
		const barWidth = (bandWidth * (1 - gap)) / slots;

		return data.map((d, i) => {
			const left = padding + i * bandWidth + (bandWidth * gap) / 2 + slot * barWidth;

			return {
				x: left + barWidth / 2,
				y: yScale(highs[i]),
				y0: yScale(stackOf ? lows[i] : zero),
				width: barWidth,
				left,
				index: i,
				datum: d
			};
		});
	}

	const yScale = axisScale(fixedY || extent(yValues), yRange);
	const xs = data.map((d, i) => getX(d, i));
	const xScale = axisScale(readDomain(opts.xDomain) || extent(xs), [padding, width - padding]);
	const bottom = height - padding;

	return data.map((d, i) => ({
		x: xScale(xs[i]),
		y: yScale(highs[i]),
		y0: lows[i] === undefined ? bottom : yScale(lows[i]),
		index: i,
		datum: d
	}));
};

const readSource = (source) => (typeof source === "function" ? source() : source) || [];

/**
 * Where each datum lands on screen, under the same options a `spark()` uses —
 * hit-test a pointer against these to drive a tooltip or a cursor.
 *
 * @param {Function|Array} source `() => data` or an array (read once, now)
 * @param {object} [opts] the spark options (kind, size, domains, stack, group…)
 * @returns {Array<object>} `{ x, y, y0, index, datum }` per point — `y0` is the
 *   baseline under it; bars add `width` and `left`
 */
export const project = (source, opts = {}) => geometry(readSource(source), opts);

/**
 * @param {Function|Array} source `() => data` (reactive) or a static array
 * @param {object} [opts]
 * @param {"line"|"area"|"bar"} [opts.kind]
 * @param {number} [opts.width] / [opts.height] / [opts.padding]
 * @param {string|Function} [opts.x] key or accessor for x (default: index)
 * @param {string|Function} [opts.y] key or accessor for y (default: the number)
 * @param {Array|Function} [opts.xDomain] / [opts.yDomain] fixed [min, max] (or a
 *   thunk) so several sparks share axes; default: the data's extent
 * @param {number} [opts.base] y baseline the area fills down to / bars grow from
 * @param {Array|Function} [opts.stack] per-point baseline (stacking): values are
 *   drawn on top of it
 * @param {"linear"|"monotone"|"natural"|"step"} [opts.curve] line/area shape
 * @param {Array} [opts.group] bars: [slot, slots] — the n-th of k bars per band
 * @param {number} [opts.gap] bars: fraction of each band left empty (default 0.2)
 * @param {number} [opts.radius] bars: corner radius
 * @param {boolean} [opts.responsive] fill the container (width/height 100%)
 *   with strokes that keep their width when stretched
 * @param {string} [opts.stroke] / [opts.fill] / [opts.class]
 * @param {number} [opts.strokeWidth]
 * @param {boolean} [opts.dots] / [opts.axis]
 * @returns {SVGElement} an `el()` `<svg>`
 */
export const spark = (source, opts = {}) => {
	const {
		kind = "line", stroke = "currentColor", fill = "none", strokeWidth = 1.5,
		dots = false, axis = false, curve = "linear", responsive = false
	} = opts;
	const { width, height, padding } = sizeOf(opts);
	const points = () => geometry(readSource(source), opts);
	const strokeAttrs = responsive ? { "vector-effect": "non-scaling-stroke" } : {};

	const linePath = () => curvePath(points().map((p) => [p.x, p.y]), curve);

	const areaPath = () => {
		const pts = points();

		if(!pts.length) { return ""; }

		const top = curvePath(pts.map((p) => [p.x, p.y]), curve);
		const under = curvePath(pts.map((p) => [p.x, p.y0]).reverse(), curve).replace(/^M/, " L");

		return `${top}${under} Z`;
	};

	const bars = () => points().map((p) => el("rect", {
		x: round(p.left),
		y: round(Math.min(p.y, p.y0)),
		width: round(p.width),
		height: round(Math.abs(p.y0 - p.y)),
		rx: opts.radius ? round(Math.min(opts.radius, p.width / 2)) : null,
		fill: stroke
	}));

	const marks = [];

	if(kind === "area") {
		marks.push(el("path", { d: () => areaPath(), fill: fill === "none" ? "currentColor" : fill, "fill-opacity": 0.15, stroke: "none" }));
		marks.push(el("path", Object.assign({ d: () => linePath(), fill: "none", stroke, "stroke-width": strokeWidth }, strokeAttrs)));
	} else if(kind === "bar") {
		marks.push(() => bars());
	} else {
		marks.push(el("path", Object.assign({ d: () => linePath(), fill, stroke, "stroke-width": strokeWidth }, strokeAttrs)));
	}

	if(dots) {
		marks.push(() => points().map((p) => el("circle", { cx: round(p.x), cy: round(p.y), r: 2, fill: stroke })));
	}

	if(axis) {
		marks.push(el("line", Object.assign({
			x1: padding, y1: height - padding, x2: width - padding, y2: height - padding,
			stroke: "currentColor", "stroke-opacity": 0.2
		}, strokeAttrs)));
	}

	return el("svg", {
		viewBox: `0 0 ${width} ${height}`,
		width: responsive ? "100%" : width,
		height: responsive ? "100%" : height,
		preserveAspectRatio: "none",
		class: opts.class
	}, ...marks);
};
