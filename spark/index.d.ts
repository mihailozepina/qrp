/**
 * @module spark
 * A charting *primitive*: data in, a reactive `el()` `<svg>` out (line / area /
 * bar). No tooltips/legends — the sparkline/mini-chart 80% — but `project()`
 * returns the screen points the marks are drawn from, for your own hit-testing.
 * Pass `() => series` for a live chart. Composes `scale`; enabled by SVG-aware `el`.
 *
 * **Several series, one chart:** give every spark the same `xDomain`/`yDomain`
 * (a shared [min, max] or thunk) and layer the `<svg>`s; `stack` puts a series on
 * a baseline (stacked areas/bars) and `group: [i, n]` places grouped bars side by
 * side. `responsive: true` stretches to the container without distorting strokes.
 *
 * **Colour & theming:** the mark uses `stroke` (default `"currentColor"`), so it
 * inherits the surrounding text colour and works in any theme — set `color` on a
 * parent, or pass `stroke`/`fill`. A single-point (or perfectly flat) series
 * renders centered, not pinned to the corner.
 *
 * **`axis: true`** draws only a **baseline rule** (a `<line>` in `currentColor` at
 * low opacity) — no tick labels; this is a primitive, not an axis component. For
 * labelled ticks, add your own `<text>` (see `scale.ticks`) or a caption next to
 * the chart.
 *
 * **Recipe — multiple series on a shared scale** (actual-vs-target,
 * before-vs-after). `spark()` is deliberately single-series; the multi-line 80%
 * chart is a short composition in the same idiom — a static `el()` `<svg>`
 * skeleton, one reactive `points` binding per series over a *shared* y-domain,
 * and `list()` for grid lines keyed by tick value:
 * @example
 * const SERIES = [{ key: "total", stroke: "var(--c1)" }, { key: "balance", stroke: "var(--c2)" }];
 * const chart = (data, w = 240, h = 60) => {          // data: () => [{ x, total, balance }]
 *   const yDomain = () => {                           // SHARED across all series
 *     const ys = data().flatMap((d) => SERIES.map((s) => d[s.key]));
 *     return [Math.min(...ys), Math.max(...ys)];
 *   };
 *   const sx = (d) => linear([data()[0]?.x ?? 0, data().at(-1)?.x ?? 1], [0, w])(d);
 *   const sy = (v) => linear(yDomain(), [h, 0])(v);
 *   const pts = (key) => () => data().map((d) => `${sx(d.x)},${sy(d[key])}`).join(" ");
 *   return el("svg", { viewBox: `0 0 ${w} ${h}` },
 *     list(() => ticks(yDomain(), 4), (t) => t, (t) =>            // grid, keyed by value
 *       el("line", { x1: 0, x2: w, y1: () => sy(t), y2: () => sy(t), stroke: "currentColor", opacity: 0.1 })),
 *     ...SERIES.map((s) => el("polyline", { points: pts(s.key), fill: "none", stroke: s.stroke, "stroke-width": 1.5 })));
 * };
 */

export interface SparkOptions {
	kind?: "line" | "area" | "bar";
	width?: number;
	height?: number;
	padding?: number;
	/** key or accessor for x (default: array index). */
	x?: string | ((d: any, i: number) => number);
	/** key or accessor for y (default: the number itself, or `d.y`). */
	y?: string | ((d: any, i: number) => number);
	/** Fixed x extent (or a thunk) — share it across sparks for a common axis. Line/area only. */
	xDomain?: readonly [number, number] | (() => readonly [number, number]);
	/** Fixed y extent (or a thunk) — share it across sparks for a common axis. */
	yDomain?: readonly [number, number] | (() => readonly [number, number]);
	/** y baseline: the area fills down to it, bars grow from it (bars default 0). */
	base?: number;
	/** Per-point baseline for stacking: an array aligned with the data, or (d, i) => number. */
	stack?: readonly number[] | ((d: any, i: number) => number);
	/** Line/area interpolation (default "linear"). */
	curve?: "linear" | "monotone" | "natural" | "step";
	/** Bars: `[slot, slots]` — this series is the slot-th of `slots` bars per band. */
	group?: readonly [number, number];
	/** Bars: fraction of each band left empty (default 0.2). */
	gap?: number;
	/** Bars: corner radius. */
	radius?: number;
	/** Fill the container (width/height 100%) with strokes that keep their width. */
	responsive?: boolean;
	stroke?: string;
	fill?: string;
	strokeWidth?: number;
	dots?: boolean;
	/** Draw a baseline rule (currentColor, low opacity). No tick labels. */
	axis?: boolean;
	class?: string;
}

/** A datum's place on screen, from `project()`. */
export interface SparkPoint<T = any> {
	x: number;
	y: number;
	/** The baseline under the point (area floor / bar start). */
	y0: number;
	index: number;
	datum: T;
	/** Bars only: the bar's width and left edge. */
	width?: number;
	left?: number;
}

/** Data → a reactive `<svg>` mini-chart. Pass `() => data` to make it live. */
export function spark(source: (() => readonly any[]) | readonly any[], opts?: SparkOptions): SVGElement;

/**
 * Where each datum lands on screen under the same options a `spark()` uses — the
 * points its marks are drawn from. Hit-test a pointer against them for a
 * tooltip or cursor. Reads the source once, now.
 */
export function project<T = any>(source: (() => readonly T[]) | readonly T[], opts?: SparkOptions): SparkPoint<T>[];
