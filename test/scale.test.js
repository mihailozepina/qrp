import test from "node:test";
import assert from "node:assert/strict";
import { linear, ordinal, quantize, ticks, palette, nice } from "../scale/index.js";

test("linear maps + clamps", () => {
	assert.equal(linear([0, 100], [0, 300])(50), 150);
	assert.equal(linear([0, 10], [0, 1], { clamp: true })(20), 1);
	assert.equal(linear([5, 5], [0, 1])(5), 0); // zero span → r0
});

test("ordinal lazily assigns + cycles", () => {
	const c = ordinal(["a", "b"]);
	assert.equal(c("x"), "a");
	assert.equal(c("y"), "b");
	assert.equal(c("z"), "a"); // wraps
	assert.equal(c("x"), "a"); // stable per value
});

test("quantize buckets", () => {
	const q = quantize([0, 1], ["low", "mid", "high"]);
	assert.equal(q(0.1), "low");
	assert.equal(q(0.9), "high");
	assert.equal(q(2), "high"); // clamped
});

test("ticks + palette", () => {
	assert.deepEqual(ticks([0, 10], 5), [0, 2, 4, 6, 8, 10]);
	assert.equal(palette.length, 8);
});

test("nice rounds a domain out to whole steps with clean ticks", () => {
	assert.deepEqual(nice([3, 97], 5), { domain: [0, 100], step: 20, ticks: [0, 20, 40, 60, 80, 100] });
	assert.deepEqual(nice([0.13, 0.87]).ticks, [0, 0.2, 0.4, 0.6, 0.8, 1]);
	assert.deepEqual(nice([-12, 48], 4).domain, [-20, 60]);
	assert.deepEqual(nice([5, 5]).domain.length, 2, "a degenerate domain still gets a span");
});
