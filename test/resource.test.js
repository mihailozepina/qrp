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

test("asyncView: the documented data branch follows a reload and keeps its rows", async () => {
	let rows = [{ id: 1, n: "a" }, { id: 2, n: "b" }];
	const res = resource(() => Promise.resolve(rows));
	const ul = el("ul", {}, asyncView(res, {
		data: () => list(() => res.data, (r) => r.id, (r) => el("li", {}, () => r.n))
	}));

	await res.reload();
	const first = ul.querySelector("li");
	assert.deepEqual([...ul.querySelectorAll("li")].map((li) => li.textContent), ["a", "b"]);

	rows = [{ id: 1, n: "A" }, { id: 3, n: "c" }];
	await res.reload();

	assert.deepEqual([...ul.querySelectorAll("li")].map((li) => li.textContent), ["A", "c"]);
	assert.equal(ul.querySelector("li"), first, "the surviving row element is reused");
});
