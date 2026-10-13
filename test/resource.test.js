import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { effect, el, list } from "../qrp/index.js";
import { emitter } from "../events/index.js";
import { resource, asyncView } from "../resource/index.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

test("loads: loading → data, error stays null", async () => {
	const res = resource(() => Promise.resolve([1, 2]), { immediate: false });
	assert.equal(res.data, null);
	const p = res.reload();
	assert.equal(res.loading, true);
	await p;
	assert.deepEqual(res.data, [1, 2]);
	assert.equal(res.loading, false);
	assert.equal(res.error, null);
});

test("captures errors", async () => {
	const res = resource(() => Promise.reject(new Error("boom")), { immediate: false });
	await res.reload();
	assert.equal(res.error.message, "boom");
	assert.equal(res.loading, false);
});

test("data is reactive", async () => {
	const res = resource(() => Promise.resolve(7), { immediate: false });
	let seen;
	effect(() => { seen = res.data; });
	assert.equal(seen, null);
	await res.reload();
	assert.equal(seen, 7);
});

test("refreshOn a bus event reloads", async () => {
	const b = emitter();
	let calls = 0;
	resource(() => { calls += 1; return Promise.resolve(calls); }, { bus: b, refreshOn: "refresh" });
	await tick();
	assert.equal(calls, 1);       // immediate load
	b.emit("refresh");
	await tick();
	assert.equal(calls, 2);       // reloaded on the event
});

// A fetcher that hands back the next queued response on each call.
const sequence = (...responses) => {
	let i = 0;

	return () => {
		const next = responses[Math.min(i, responses.length - 1)];
		i += 1;

		return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
	};
};

test("asyncView: loading → data", async () => {
	const res = resource(sequence([{ id: 1, name: "a" }]), { immediate: false });
	const host = el("div", {}, asyncView(res, {
		loading: () => el("i", {}, "loading"),
		data: (rows) => list(() => rows, (r) => r.id, (r) => el("p", {}, r.name))
	}));
	assert.equal(host.textContent, "");
	const p = res.reload();
	assert.equal(host.textContent, "loading");
	await p;
	assert.equal(host.textContent, "a");
});

test("asyncView: data branch re-renders with the new data after reload (doc example)", async () => {
	const res = resource(sequence(
		[{ id: 1, name: "a" }],
		[{ id: 2, name: "b" }, { id: 3, name: "c" }]
	));
	const host = el("div", {}, asyncView(res, {
		data: (rows) => list(() => rows, (r) => r.id, (r) => el("p", {}, r.name))
	}));
	await tick();
	assert.equal(host.textContent, "a");
	await res.reload();
	assert.equal(host.textContent, "bc");
});

test("asyncView: data branch is kept (not rebuilt) while a reload is in flight", async () => {
	const res = resource(sequence([1], [2]));
	let builds = 0;
	const host = el("div", {}, asyncView(res, {
		loading: () => el("i", {}, "loading"),
		data: (rows) => { builds += 1; return el("p", {}, String(rows[0])); }
	}));
	await tick();
	assert.equal(builds, 1);
	const p = res.reload();
	assert.equal(res.loading, true);
	assert.equal(host.textContent, "1"); // stale data stays up, no loading flash
	assert.equal(builds, 1);
	await p;
	assert.equal(host.textContent, "2");
	assert.equal(builds, 2);
});

test("asyncView: error branch shows the latest error", async () => {
	const res = resource(sequence(new Error("first"), new Error("second")));
	const host = el("div", {}, asyncView(res, {
		error: (e) => el("p", {}, e.message)
	}));
	await tick();
	assert.equal(host.textContent, "first");
	await res.reload();
	assert.equal(host.textContent, "second");
});

test("asyncView: empty branch, then data", async () => {
	const res = resource(sequence([], [{ id: 1, name: "a" }]));
	const host = el("div", {}, asyncView(res, {
		empty: () => el("p", {}, "none"),
		data: (rows) => list(() => rows, (r) => r.id, (r) => el("p", {}, r.name))
	}));
	await tick();
	assert.equal(host.textContent, "none");
	await res.reload();
	assert.equal(host.textContent, "a");
});
