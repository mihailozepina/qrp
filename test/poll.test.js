import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { scoped } from "../qrp/index.js";
import { poll } from "../browser/index.js";

test("immediate runs fn once up front", () => {
	let n = 0;
	const { stop } = poll(() => { n += 1; }, 10000, { immediate: true });
	assert.equal(n, 1);
	stop();
});

test("fires on the interval, and stop() halts it", async () => {
	let n = 0;
	const { stop } = poll(() => { n += 1; }, 10);
	await new Promise((r) => setTimeout(r, 35));
	stop();
	const after = n;
	assert.ok(after >= 1, "fired at least once");
	await new Promise((r) => setTimeout(r, 30));
	assert.equal(n, after, "no more ticks after stop()");
});

test("scope dispose clears the interval", async () => {
	let n = 0;
	const { dispose } = scoped(() => { poll(() => { n += 1; }, 10); });
	dispose();
	const after = n;
	await new Promise((r) => setTimeout(r, 30));
	assert.equal(n, after, "disposed → no ticks");
});

const setVisibility = (value) => {
	Object.defineProperty(document, "visibilityState", { get: () => value, configurable: true });
	document.dispatchEvent(new Event("visibilitychange"));
};

test("stop() survives the tab becoming visible again", async () => {
	let n = 0;
	const { dispose } = scoped(() => {
		const { stop } = poll(() => { n += 1; }, 10);

		stop();
	});

	try {
		setVisibility("hidden");
		setVisibility("visible");

		await new Promise((r) => setTimeout(r, 35));
		assert.equal(n, 0, "a user stop() is not undone by visibilitychange");
	} finally {
		delete document.visibilityState;
		dispose();
	}
});

test("start() after stop() resumes, and hidden/visible still pause and resume", async () => {
	let n = 0;
	let handle;
	const { dispose } = scoped(() => {
		handle = poll(() => { n += 1; }, 10);
	});

	try {
		handle.stop();
		handle.start();

		setVisibility("hidden");
		await new Promise((r) => setTimeout(r, 35));
		assert.equal(n, 0, "paused while hidden");

		setVisibility("visible");
		await new Promise((r) => setTimeout(r, 35));
		assert.ok(n >= 1, "resumed when visible");
	} finally {
		delete document.visibilityState;
		dispose();
	}
});

test("start() while the tab is hidden waits for it to become visible", async () => {
	let n = 0;
	let handle;
	const { dispose } = scoped(() => {
		handle = poll(() => { n += 1; }, 10);
	});

	try {
		handle.stop();
		setVisibility("hidden");
		handle.start();

		await new Promise((r) => setTimeout(r, 35));
		assert.equal(n, 0, "no background polling after start() while hidden");

		setVisibility("visible");
		await new Promise((r) => setTimeout(r, 35));
		assert.ok(n >= 1, "runs once visible");
	} finally {
		delete document.visibilityState;
		dispose();
	}
});
