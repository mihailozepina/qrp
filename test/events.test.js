import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, effect, scope } from "../qrp/index.js";
import { emitter, bus, fromEvent, broadcast, channel } from "../events/index.js";

test("emitter on/emit delivers payloads", () => {
	const e = emitter();

	let got;
	e.on("ping", payload => { got = payload; });

	e.emit("ping", { n: 1 });

	assert.deepEqual(got, { n: 1 });
});

test("off unsubscribes", () => {
	const e = emitter();

	let count = 0;
	const off = e.on("ping", () => { count++; });

	e.emit("ping");
	off();
	e.emit("ping");

	assert.equal(count, 1);
});

test("one handler on two types: off removes only the named type", () => {
	const e = emitter();

	let a = 0;
	let b = 0;
	const handler = (n) => { if(n === "a") { a++; } else { b++; } };

	e.on("typeA", handler);
	e.on("typeB", handler);

	e.emit("typeA", "a");
	e.emit("typeB", "b");
	assert.equal(a, 1);
	assert.equal(b, 1);

	e.off("typeA", handler); // must NOT also unsubscribe typeB

	e.emit("typeA", "a");
	e.emit("typeB", "b");
	assert.equal(a, 1); // typeA removed
	assert.equal(b, 2); // typeB still live
});

test("once resolves on the next event", async () => {
	const e = emitter();

	const p = e.once("ready");
	e.emit("ready", "go");

	assert.equal(await p, "go");
});

test("request/respond round-trips through the bus", async () => {
	const e = emitter();

	e.respond("add", ({ a, b }) => a + b);

	const result = await e.request("add", { a: 2, b: 3 });

	assert.equal(result, 5);
});

test("request rejects on responder error", async () => {
	const e = emitter();

	e.respond("boom", () => { throw new Error("nope"); });

	await assert.rejects(() => e.request("boom", {}), /nope/);
});

test("request times out with no responder", async () => {
	const e = emitter();

	await assert.rejects(() => e.request("silence", {}, { timeout: 20 }), /timed out/);
});

test("fromEvent turns bus events into reactive state", () => {
	const last = fromEvent(bus, "user:login", u => u.name, "nobody");

	let seen;
	effect(() => { seen = last.value; });

	assert.equal(seen, "nobody");

	bus.emit("user:login", { name: "Nemanja" });

	assert.equal(seen, "Nemanja");
});

test("broadcast mirrors state changes onto an emitter", () => {
	const e = emitter();

	const store = state({ value: 0 });

	const seen = [];
	e.on("count", v => seen.push(v));

	broadcast(e, "count", store);

	store.value = 1;
	store.value = 2;

	// initial effect run emits 0, then 1, then 2
	assert.deepEqual(seen, [0, 1, 2]);
});

test("same handler subscribed twice: each unsubscribe removes its own listener", () => {
	const e = emitter();

	let count = 0;
	const handler = () => { count++; };

	const offA = e.on("x", handler);
	const offB = e.on("x", handler);

	e.emit("x");
	assert.equal(count, 2);

	offA();
	e.emit("x");
	assert.equal(count, 3); // offB's subscription still live

	offB();
	e.emit("x");
	assert.equal(count, 3); // both gone
});

test("off(type, handler) removes every subscription of that handler on that type", () => {
	const e = emitter();

	let count = 0;
	const handler = () => { count++; };

	e.on("x", handler);
	e.on("x", handler);
	e.off("x", handler);

	e.emit("x");
	assert.equal(count, 0);
});

test("fromEvent unsubscribes from an emitter when its scope is disposed", () => {
	const e = emitter();

	let last;
	const s = scope(() => { last = fromEvent(e, "tick"); });

	e.emit("tick", 1);
	assert.equal(last.value, 1);

	s.dispose();
	e.emit("tick", 2);
	assert.equal(last.value, 1);
});

test("fromEvent unsubscribes from a raw EventTarget when its scope is disposed", () => {
	const target = new EventTarget();

	let last;
	const s = scope(() => { last = fromEvent(target, "tick"); });

	target.dispatchEvent(new CustomEvent("tick", { detail: 1 }));
	assert.equal(last.value, 1);

	s.dispose();
	target.dispatchEvent(new CustomEvent("tick", { detail: 2 }));
	assert.equal(last.value, 1);
});

test("channel fallback without BroadcastChannel still exposes close()", () => {
	const saved = globalThis.BroadcastChannel;

	delete globalThis.BroadcastChannel;

	try {
		const ch = channel("fallback");

		let got;
		ch.on("x", v => { got = v; });
		ch.emit("x", 1);

		assert.equal(got, 1);
		assert.doesNotThrow(() => ch.close());
	} finally {
		globalThis.BroadcastChannel = saved;
	}
});

test("channel emit returns the channel so chained emits still broadcast", () => {
	const saved = globalThis.BroadcastChannel;
	const posted = [];

	globalThis.BroadcastChannel = function FakeChannel() {
		this.postMessage = (message) => posted.push(message.type);
		this.close = () => {};
	};

	try {
		const ch = channel("chain");

		ch.emit("a", 1).emit("b", 2);

		assert.deepEqual(posted, ["a", "b"]);
	} finally {
		globalThis.BroadcastChannel = saved;
	}
});
