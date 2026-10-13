import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, el, list } from "../qrp/index.js";
import { collection, compareValues } from "../collection/index.js";

const rows = () => [
	{ id: 1, name: "carol", age: 30 },
	{ id: 2, name: "alice", age: 25 },
	{ id: 3, name: "bob", age: 35 }
];

test("collection sorts by key and direction", () => {
	const source = state({ items: rows() });
	const view = collection(() => source.items, { sort: state({ key: "name", dir: 1 }) });

	assert.deepEqual(view.items().map((r) => r.name), ["alice", "bob", "carol"]);

	view.sort.dir = -1;
	assert.deepEqual(view.items().map((r) => r.name), ["carol", "bob", "alice"]);
});

test("toggleSort flips direction on repeat, resets on new key", () => {
	const source = state({ items: rows() });
	const view = collection(() => source.items, { sort: state({ key: null, dir: 1 }) });

	view.toggleSort("age");
	assert.deepEqual(view.items().map((r) => r.age), [25, 30, 35]);

	view.toggleSort("age"); // same key → desc
	assert.deepEqual(view.items().map((r) => r.age), [35, 30, 25]);

	view.toggleSort("name"); // new key → asc
	assert.deepEqual(view.items().map((r) => r.name), ["alice", "bob", "carol"]);
});

test("collection filters via filterFn + filter state", () => {
	const source = state({ items: rows() });
	const filter = state({ q: "" });
	const view = collection(() => source.items, {
		filter,
		filterFn: (row, f) => row.name.indexOf(f.q) !== -1
	});

	assert.equal(view.items().length, 3);

	filter.q = "a";
	assert.deepEqual(view.items().map((r) => r.name).sort(), ["alice", "carol"]);
	assert.equal(view.total(), 2);
});

test("collection paginates and reports pageCount", () => {
	const source = state({ items: rows() });
	const page = state({ index: 0, size: 2 });
	const view = collection(() => source.items, { page });

	assert.equal(view.items().length, 2);
	assert.equal(view.pageCount(), 2);
	assert.equal(view.total(), 3);

	page.index = 1;
	assert.equal(view.items().length, 1); // last page has the remainder
});

test("page index clamps when a filter shrinks the set", () => {
	const source = state({ items: rows() }); // 3 rows
	const page = state({ index: 2, size: 2 });   // page 2 (0-based) — beyond range
	const filter = state({ q: "" });
	const view = collection(() => source.items, {
		page,
		filter,
		filterFn: (r, f) => r.name.indexOf(f.q) !== -1
	});

	// filter to 1 row while parked on page 2 → clamp to the last valid page, not blank
	filter.q = "alice";
	assert.equal(view.items().length, 1);
	assert.equal(view.items()[0].name, "alice");
});

test("collection.items drives a keyed list reactively", () => {
	const source = state({ items: rows() });
	const filter = state({ q: "" });
	const view = collection(() => source.items, {
		sort: state({ key: "name", dir: 1 }),
		filter,
		filterFn: (row, f) => row.name.indexOf(f.q) !== -1
	});

	const ul = el("ul", {}, list(view.items, (r) => r.id, (r) => el("li", {}, () => r.name)));

	assert.deepEqual([...ul.querySelectorAll("li")].map((li) => li.textContent), ["alice", "bob", "carol"]);

	filter.q = "o"; // bob, carol
	assert.deepEqual([...ul.querySelectorAll("li")].map((li) => li.textContent), ["bob", "carol"]);
});

const sortedBy = (values, dir) => {
	const items = values.map((v, i) => ({ id: i, v }));
	const view = collection(() => items, { sort: { key: "v", dir } });

	return view.items().map((r) => String(r.v)).join(" ");
};

test("sort puts null/undefined last in both directions and keeps real values ordered", () => {
	const values = [5, undefined, 3, null, 9, undefined, 1, 7, null, 2, 8, undefined, 4, 6];
	const missing = "undefined null undefined null undefined"; // stable: source order

	assert.equal(sortedBy(values, 1), `1 2 3 4 5 6 7 8 9 ${missing}`);
	assert.equal(sortedBy(values, -1), `9 8 7 6 5 4 3 2 1 ${missing}`);
});

test("sort orders mixed numbers and strings consistently (natural order)", () => {
	assert.equal(sortedBy([10, "n/a", 2, "n/a", 33, 1], 1), "1 2 10 33 n/a n/a");
	assert.equal(sortedBy(["item 10", "item 2", "item 1"], 1), "item 1 item 2 item 10");
	assert.equal(sortedBy([10, "n/a", 2, "n/a", 33, 1], -1), "n/a n/a 33 10 2 1");
});

test("sort compares Date values chronologically", () => {
	const dates = [new Date("2024-03-01"), new Date("2023-12-31"), null, new Date("2024-01-15")];
	const items = dates.map((v, i) => ({ id: i, v }));
	const view = collection(() => items, { sort: { key: "v", dir: 1 } });

	assert.deepEqual(view.items().map((r) => r.id), [1, 3, 0, 2]);

	view.sort.dir = -1;
	assert.deepEqual(view.items().map((r) => r.id), [0, 3, 1, 2]);
});

test("compareValues: nullish last regardless of direction, equal → 0", () => {
	assert.equal(compareValues(1, 1, 1), 0);
	assert.equal(compareValues(null, undefined, -1), 0);
	assert.ok(compareValues(null, 1, 1) > 0);
	assert.ok(compareValues(null, 1, -1) > 0);
	assert.ok(compareValues(1, undefined, -1) < 0);
	assert.ok(compareValues(2, 10, 1) < 0);
	assert.ok(compareValues(2, 10, -1) > 0);
});

test("pageIndex() is the clamped page items() actually shows", () => {
	const source = state({ items: Array.from({ length: 100 }, (_u, i) => ({ id: i })) });
	const filter = state({ max: 100 });
	const page = state({ index: 9, size: 10 });
	const view = collection(() => source.items, { page, filter, filterFn: (r, f) => r.id < f.max });

	assert.equal(view.pageIndex(), 9);

	filter.max = 25;   // 3 pages left while parked on page 9
	assert.equal(view.pageIndex(), 2);
	assert.equal(view.items()[0].id, 20);
	assert.equal(page.index, 9, "the raw index is left alone (widening the filter restores it)");

	filter.max = 0;
	assert.equal(view.pageIndex(), 0, "empty set → page 0");

	page.index = -3;
	filter.max = 100;
	assert.equal(view.pageIndex(), 0, "negative index clamps to 0");
});
