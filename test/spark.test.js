import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { state } from "../qrp/index.js";
import { spark, project } from "../spark/index.js";

const SVG_NS = "http://www.w3.org/2000/svg";

test("spark line → svg with a path", () => {
	const svg = spark([1, 3, 2, 5], { kind: "line" });
	assert.equal(svg.namespaceURI, SVG_NS);
	assert.ok(svg.querySelector("path").getAttribute("d").startsWith("M"));
});

test("spark is reactive to its source thunk", () => {
	const s = state({ data: [1, 2] });
	const svg = spark(() => s.data);
	const before = svg.querySelector("path").getAttribute("d");
	s.data = [1, 50, 1];
	assert.notEqual(svg.querySelector("path").getAttribute("d"), before);
});

test("spark bar → one rect per point", () => {
	assert.equal(spark([1, 2, 3], { kind: "bar" }).querySelectorAll("rect").length, 3);
});

test("spark empty data → empty path (no crash)", () => {
	assert.equal(spark([], {}).querySelector("path").getAttribute("d"), "");
});

test("a single point renders centered, not in the corner", () => {
	const svg = spark([5], { kind: "line", dots: true, width: 200, height: 100 });
	const dot = svg.querySelector("circle");
	// centered: ~width/2, ~height/2 (not padding/bottom-left)
	assert.ok(Math.abs(Number(dot.getAttribute("cx")) - 100) < 1, "cx centered");
	assert.ok(Math.abs(Number(dot.getAttribute("cy")) - 50) < 1, "cy centered");
});

test("a flat series sits on the vertical middle", () => {
	const svg = spark([7, 7, 7], { kind: "line", dots: true, height: 100 });
	const cys = [...svg.querySelectorAll("circle")].map((c) => Number(c.getAttribute("cy")));
	cys.forEach((cy) => assert.ok(Math.abs(cy - 50) < 1, "flat → vertical middle"));
});

// --- shared domains, baselines, curves, stacking, grouping, project ---------

test("defaults are unchanged: bars keep the 80% band at the 10% offset, growing from zero", () => {
	const rects = [...spark([2, -1], { kind: "bar", width: 104, height: 54, padding: 2 }).querySelectorAll("rect")];
	const [a, b] = rects.map((r) => ["x", "y", "width", "height"].map((k) => Number(r.getAttribute(k))));

	assert.deepEqual(a, [7, 2, 40, 33.33]);   // band 50: x = 2 + 5, width 40; 2 of 3 units above zero
	assert.deepEqual(b, [57, 35.33, 40, 16.67]);
	assert.equal(rects[0].hasAttribute("rx"), false);
});

test("project returns the points the marks are drawn from", () => {
	const points = project([0, 10], { width: 104, height: 54, padding: 2 });

	assert.equal(points.length, 2);
	assert.deepEqual(points.map((p) => [p.x, p.y, p.y0]), [[2, 52, 52], [102, 2, 52]]);
	assert.equal(points[1].datum, 10);
	assert.equal(points[1].index, 1);

	const d = spark([0, 10], { width: 104, height: 54, padding: 2 }).querySelector("path").getAttribute("d");

	assert.equal(d, "M2.00,52.00 L102.00,2.00");
});

test("a shared yDomain puts two series on one axis (and a thunk domain is reactive)", () => {
	const low = project([5], { yDomain: [0, 10], height: 104, padding: 2 });

	assert.equal(low[0].y, 52, "5 of 0..10 sits at the domain's middle (plot spans 102 → 2)");

	const s = state({ top: 10 });
	const svg = spark([5, 5], { yDomain: () => [0, s.top], height: 104, padding: 2, dots: true });

	assert.equal(Number(svg.querySelector("circle").getAttribute("cy")), 52);
	s.top = 20;
	assert.equal(Number(svg.querySelector("circle").getAttribute("cy")), 77);
});

test("xDomain aligns sparse series on a common x axis", () => {
	const points = project([{ x: 5, y: 1 }, { x: 10, y: 2 }], { x: "x", y: "y", xDomain: [0, 10], width: 104, padding: 2 });

	assert.deepEqual(points.map((p) => p.x), [52, 102]);
});

test("base: the area fills down to the baseline value, not the bottom edge", () => {
	const points = project([2, 4], { kind: "area", base: 0, height: 104, padding: 2 });

	assert.ok(points.every((p) => p.y0 === 102), "base 0 is the bottom when it is the minimum");

	const lifted = project([2, 4], { kind: "area", base: 3, height: 104, padding: 2 });

	assert.equal(lifted[0].y0, lifted[1].y0, "a flat baseline");
	assert.ok(lifted[0].y0 < 102 && lifted[0].y0 > 2, "inside the plot");
});

test("stack: values sit on a per-point baseline (stacked areas and bars)", () => {
	const below = [1, 2];
	const points = project([1, 1], { stack: below, yDomain: [0, 4], height: 104, padding: 2 });

	assert.deepEqual(points.map((p) => [p.y0, p.y]), [[77, 52], [52, 27]]);

	const bars = [...spark([1, 1], { kind: "bar", stack: below, yDomain: [0, 4], height: 104, padding: 2 }).querySelectorAll("rect")];

	assert.deepEqual(bars.map((r) => [Number(r.getAttribute("y")), Number(r.getAttribute("height"))]), [[52, 25], [27, 25]]);
});

test("group places the n-th of k bars inside each band; gap and radius apply", () => {
	const a = project([1, 1], { kind: "bar", group: [0, 2], gap: 0, width: 104, padding: 2 });
	const b = project([1, 1], { kind: "bar", group: [1, 2], gap: 0, width: 104, padding: 2 });

	assert.deepEqual(a.map((p) => [p.left, p.width]), [[2, 25], [52, 25]]);
	assert.deepEqual(b.map((p) => [p.left, p.width]), [[27, 25], [77, 25]]);

	const rect = spark([1], { kind: "bar", radius: 4 }).querySelector("rect");

	assert.equal(rect.getAttribute("rx"), "4.00");
});

test("curve: monotone/natural draw cubic segments, step draws right angles, linear stays default", () => {
	const data = [1, 3, 2, 5];
	const path = (curve) => spark(data, { curve }).querySelector("path").getAttribute("d");

	assert.ok(path("monotone").includes("C"));
	assert.ok(path("natural").includes("C"));
	assert.match(path("step"), /H[\d.]+ V[\d.]+ H/);
	assert.ok(!path("linear").includes("C"));
	assert.equal(path(undefined), path("linear"));
	assert.ok(!spark([1, 2], { curve: "monotone" }).querySelector("path").getAttribute("d").includes("C"), "two points: a straight line");
});

test("monotone never overshoots the data range", () => {
	const points = project([0, 10, 10, 0], { height: 104, padding: 2 });
	const d = spark([0, 10, 10, 0], { curve: "monotone", height: 104, padding: 2 }).querySelector("path").getAttribute("d");
	const ys = [...d.matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
	const top = Math.min(...points.map((p) => p.y));

	assert.ok(ys.every((y) => y >= top - 0.01), "no control point above the highest datum");
});

test("area with a curve closes along its baseline", () => {
	const d = spark([1, 3, 2], { kind: "area", curve: "monotone", base: 0 }).querySelector("path").getAttribute("d");

	assert.ok(d.startsWith("M") && d.endsWith("Z"));
	assert.ok((d.match(/C/g) || []).length >= 4, "top and baseline are both curves");
});

test("responsive fills the container without distorting strokes", () => {
	const svg = spark([1, 2, 3], { responsive: true, axis: true });

	assert.equal(svg.getAttribute("width"), "100%");
	assert.equal(svg.getAttribute("height"), "100%");
	assert.equal(svg.querySelector("path").getAttribute("vector-effect"), "non-scaling-stroke");
	assert.equal(svg.querySelector("line").getAttribute("vector-effect"), "non-scaling-stroke");
	assert.equal(spark([1, 2]).querySelector("path").hasAttribute("vector-effect"), false, "opt-in");
});
