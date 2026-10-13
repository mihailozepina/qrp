import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { effect, scoped } from "../qrp/index.js";
import { persisted, query, media, viewport, online, cookies } from "../browser/index.js";

test("persisted loads defaults and writes through to localStorage", () => {
	localStorage.clear();

	const store = persisted("prefs", { theme: "dark" });

	assert.equal(store.theme, "dark");

	store.theme = "light";

	assert.equal(JSON.parse(localStorage.getItem("prefs")).theme, "light");
});

test("persisted restores an existing value over the default", () => {
	localStorage.clear();
	localStorage.setItem("prefs2", JSON.stringify({ theme: "solarized" }));

	const store = persisted("prefs2", { theme: "dark" });

	assert.equal(store.theme, "solarized");
});

test("persisted keeps working (unsaved) when localStorage.setItem throws", () => {
	const realStorage = globalThis.localStorage;
	const realWarn = console.warn;
	const warnings = [];

	globalThis.localStorage = {
		getItem: () => null,
		setItem: () => {
			throw new Error("QuotaExceededError");
		}
	};
	console.warn = (...args) => warnings.push(args);

	try {
		const store = persisted("full", { theme: "dark" });

		assert.equal(store.theme, "dark");

		const seen = [];
		effect(() => seen.push(store.theme));

		store.theme = "light";
		store.theme = "blue";

		assert.equal(store.theme, "blue");
		assert.deepEqual(seen, ["dark", "light", "blue"]);
		assert.equal(warnings.length, 1, "warns once, not on every write");
	} finally {
		globalThis.localStorage = realStorage;
		console.warn = realWarn;
	}
});

const withCookie = (value, fn) => {
	Object.defineProperty(document, "cookie", { get: () => value, configurable: true });

	try {
		return fn();
	} finally {
		delete document.cookie;
	}
};

test("cookies() falls back to the raw value when it isn't valid percent-encoding", () => {
	withCookie("bad=100%; good=a%20b", () => {
		const { dispose } = scoped(() => {
			const jar = cookies();

			assert.equal(jar.bad, "100%");
			assert.equal(jar.good, "a b");
		});

		dispose();
	});
});

test("cookies() treats a cookie without = as a name with an empty value", () => {
	withCookie("flag; theme=dark", () => {
		const { dispose } = scoped(() => {
			const jar = cookies();

			assert.deepEqual({ ...jar }, { flag: "", theme: "dark" });
		});

		dispose();
	});
});

test("query reflects the URL and is reactive", () => {
	history.replaceState(null, "", "/?q=droids");

	const params = query();

	let seen;
	effect(() => { seen = params.q; });

	assert.equal(seen, "droids");

	params.q = "jawas";

	assert.equal(seen, "jawas");
	assert.match(location.search, /q=jawas/);
});

test("query({ arrays }) parses repeated params to an array and serializes back", () => {
	history.replaceState(null, "", "/?status=A&status=B&q=hi");

	const params = query({ arrays: ["status"] });

	assert.deepEqual(params.status, ["A", "B"], "repeated key → array");
	assert.equal(params.q, "hi", "undeclared key stays a string");

	let seen;
	effect(() => { seen = params.status.join(","); });
	assert.equal(seen, "A,B");

	// push updates the URL reactively (repeated-key form)
	params.status.push("C");
	assert.equal(seen, "A,B,C");
	assert.match(location.search, /status=A&status=B&status=C/);

	// assigning a new array works; empty array drops the key
	params.status = [];
	assert.equal(location.search.includes("status="), false, "empty array removes the key");
});

test("query({ arrays }) key is always an array even when absent from the URL", () => {
	history.replaceState(null, "", "/?q=x");

	const params = query({ arrays: ["ids"] });
	assert.deepEqual(params.ids, [], "declared array key absent → []");
});

test("media wraps matchMedia matches", () => {
	const m = media("(min-width: 600px)");

	assert.equal(typeof m.matches, "boolean");
});

test("viewport exposes width and height", () => {
	const v = viewport();

	assert.equal(typeof v.width, "number");
	assert.equal(typeof v.height, "number");
});

test("online reflects navigator.onLine", () => {
	const o = online();

	assert.equal(o.online, navigator.onLine);
});

test("browser factories clean up their listeners on scope dispose", async () => {
	const { scope } = await import("../qrp/index.js");

	let added = 0;
	let removed = 0;
	const realAdd = window.addEventListener;
	const realRemove = window.removeEventListener;
	window.addEventListener = function(...args) { added++; return realAdd.apply(this, args); };
	window.removeEventListener = function(...args) { removed++; return realRemove.apply(this, args); };

	try {
		const sc = scope(() => {
			viewport();
			online(); // online + offline = 2 window listeners
		});

		assert.ok(added >= 3, `expected listeners added, got ${added}`);

		sc.dispose();

		assert.equal(removed, added, "every added listener should be removed on dispose");
	} finally {
		window.addEventListener = realAdd;
		window.removeEventListener = realRemove;
	}
});
