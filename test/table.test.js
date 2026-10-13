import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, el } from "../qrp/index.js";
import { table, tablePager, tableSummary } from "../table/index.js";
import { collection } from "../collection/index.js";
import { dataGrid } from "../datagrid/index.js";

const rows = () => [
	{ id: 1, account: { name: "carol" }, followers: 1200 },
	{ id: 2, account: { name: "alice" }, followers: 300 },
	{ id: 3, account: { name: "bob" }, followers: 90000 }
];

const basic = (extra = {}) => {
	const store = state({ items: rows() });

	const t = table({
		rows: () => store.items,
		key: (i) => i.id,
		fields: [
			{ key: "name", label: "Name", sortable: true, accessor: (i) => i.account.name },
			{ key: "followers", label: "Followers", sortable: true, formatter: (v) => v.toLocaleString(), sortByFormatted: false }
		],
		...extra
	});

	return { store, t, names: () => [...t.querySelectorAll("tbody td:first-child")].map((td) => td.textContent) };
};

test("renders headers from field labels", () => {
	const { t } = basic();

	assert.deepEqual([...t.querySelectorAll("thead th")].map((th) => th.textContent.replace(/[▲▼\s]+$/, "")), ["Name", "Followers"]);
});

test("renders cells via accessor and formatter", () => {
	const { t } = basic();

	assert.deepEqual([...t.querySelectorAll("tbody tr:first-child td")].map((td) => td.textContent), ["carol", "1,200"]);
});

test("clicking a sortable header sorts, and toggles direction", () => {
	const { t, names } = basic();

	const nameTh = t.querySelectorAll("thead th")[0];
	nameTh.click(); // asc by name
	assert.deepEqual(names(), ["alice", "bob", "carol"]);

	nameTh.click(); // desc
	assert.deepEqual(names(), ["carol", "bob", "alice"]);
});

test("numeric sort uses raw value, not string compare", () => {
	const { t, names } = basic();

	// sort by followers ascending: 300, 1200, 90000 → alice, carol, bob
	t.querySelectorAll("thead th")[1].click();
	assert.deepEqual(names(), ["alice", "carol", "bob"]);
});

test("sortByFormatted sorts by the formatted string", () => {
	const store = state({ items: [{ id: 1, n: 1 }, { id: 2, n: 2 }, { id: 3, n: 3 }] });
	const label = { 1: "cherry", 2: "apple", 3: "banana" };

	const t = table({
		rows: () => store.items,
		key: (i) => i.id,
		fields: [{ key: "n", label: "N", sortable: true, formatter: (v) => label[v], sortByFormatted: true }]
	});

	t.querySelector("thead th").click();
	// raw order would be cherry, apple, banana; formatted order is alphabetical
	assert.deepEqual([...t.querySelectorAll("tbody td")].map((td) => td.textContent), ["apple", "banana", "cherry"]);
});

test("sortByFormatted compares embedded numbers naturally", () => {
	const store = state({ items: [{ id: 1, n: 2 }, { id: 2, n: 10 }, { id: 3, n: 1 }] });

	const t = table({
		rows: () => store.items,
		key: (i) => i.id,
		fields: [{ key: "n", label: "N", sortable: true, formatter: (v) => "#" + v, sortByFormatted: true }]
	});

	t.querySelector("thead th").click();
	assert.deepEqual([...t.querySelectorAll("tbody td")].map((td) => td.textContent), ["#1", "#2", "#10"]);
});

test("table sort puts missing values last in both directions, real values in order", () => {
	const values = [5, undefined, 3, null, 9, undefined, 1, 7, null, 2, 8, undefined, 4, 6];
	const store = state({ items: values.map((v, i) => ({ id: i, v })) });

	const t = table({
		rows: () => store.items,
		key: (i) => i.id,
		fields: [{ key: "v", label: "V", sortable: true, formatter: (v) => (v === null || v === undefined ? "-" : String(v)) }]
	});
	const cells = () => [...t.querySelectorAll("tbody td")].map((td) => td.textContent).join(" ");
	const th = t.querySelector("thead th");

	th.click();
	assert.equal(cells(), "1 2 3 4 5 6 7 8 9 - - - - -");

	th.click();
	assert.equal(cells(), "9 8 7 6 5 4 3 2 1 - - - - -");
});

test("table sort orders mixed numbers and strings consistently", () => {
	const store = state({ items: [10, "n/a", 2, "n/a", 33, 1].map((v, i) => ({ id: i, v })) });

	const t = table({
		rows: () => store.items,
		key: (i) => i.id,
		fields: [{ key: "v", label: "V", sortable: true }]
	});

	t.querySelector("thead th").click();
	assert.deepEqual([...t.querySelectorAll("tbody td")].map((td) => td.textContent), ["1", "2", "10", "33", "n/a", "n/a"]);
});

test("render column outputs a custom element", () => {
	const store = state({ items: rows() });
	let clicked;

	const t = table({
		rows: () => store.items,
		key: (i) => i.id,
		fields: [
			{ key: "name", label: "Name", accessor: (i) => i.account.name },
			{ key: "actions", label: "", render: (item) => el("button", { onclick: () => { clicked = item.id; } }, "Edit") }
		]
	});

	const btn = t.querySelector("tbody tr:first-child td:last-child button");
	assert.equal(btn.textContent, "Edit");
	btn.click();
	assert.equal(clicked, 1);
});

test("rowClass is applied and reactive", () => {
	const store = state({ items: rows() });
	const selected = state({ id: null });

	const t = table({
		rows: () => store.items,
		key: (i) => i.id,
		rowClass: (item) => (selected.id === item.id ? "selected" : ""),
		fields: [{ key: "name", label: "Name", accessor: (i) => i.account.name }]
	});

	assert.equal(t.querySelector("tbody tr").className, "");

	selected.id = 1;
	assert.equal(t.querySelector("tbody tr").className, "selected");
});

test("rows reuse elements across sort (keyed)", () => {
	const { t } = basic();

	const firstRowBefore = t.querySelector("tbody tr"); // carol (id 1)
	t.querySelectorAll("thead th")[0].click(); // sort by name asc → alice first

	// carol's row still exists as the same node, just moved
	const carolCellAfter = [...t.querySelectorAll("tbody td:first-child")].find((td) => td.textContent === "carol");
	assert.equal(carolCellAfter.parentElement, firstRowBefore);
});

test("cells self-update when the row data changes", () => {
	const { store, t } = basic();
	const firstCell = t.querySelector("tbody td");

	store.items = store.items.map((i) => (i.id === 1 ? { ...i, account: { name: "CAROL" } } : i));

	// same column position now shows updated value (new row for changed id)
	const carol = [...t.querySelectorAll("tbody td:first-child")].map((td) => td.textContent);
	assert.ok(carol.includes("CAROL"));
	assert.ok(firstCell); // sanity
});

test("adding a row inserts it and reuses existing row elements", () => {
	const { store, t } = basic();
	const bobCellBefore = [...t.querySelectorAll("tbody td:first-child")].find((td) => td.textContent === "bob");

	store.items = [...store.items, { id: 4, account: { name: "dave" }, followers: 42 }];

	const names = [...t.querySelectorAll("tbody td:first-child")].map((td) => td.textContent);
	assert.ok(names.includes("dave"));
	assert.equal(t.querySelectorAll("tbody tr").length, 4);

	// existing row element preserved (not rebuilt)
	const bobCellAfter = [...t.querySelectorAll("tbody td:first-child")].find((td) => td.textContent === "bob");
	assert.equal(bobCellAfter, bobCellBefore);
});

test("deleting a row removes it and keeps the survivors", () => {
	const { store, t } = basic();
	const carolCellBefore = [...t.querySelectorAll("tbody td:first-child")].find((td) => td.textContent === "carol");

	store.items = store.items.filter((i) => i.id !== 2); // drop alice

	const names = [...t.querySelectorAll("tbody td:first-child")].map((td) => td.textContent);
	assert.deepEqual(names.sort(), ["bob", "carol"]);

	// carol's element survived
	assert.equal([...t.querySelectorAll("tbody td:first-child")].find((td) => td.textContent === "carol"), carolCellBefore);
});

test("toggling filter hides and re-shows rows, reusing elements when shown again", () => {
	const store = state({ items: rows() });
	const filter = state({ q: "" });

	const t = table({
		rows: () => store.items,
		key: (i) => i.id,
		filter,
		filterFn: (item, f) => !f.q || item.account.name.indexOf(f.q) !== -1,
		fields: [{ key: "name", label: "Name", accessor: (i) => i.account.name }]
	});

	assert.equal(t.querySelectorAll("tbody tr").length, 3);
	const bobCell = [...t.querySelectorAll("tbody td")].find((td) => td.textContent === "bob");

	filter.q = "bob"; // hide all but bob
	assert.deepEqual([...t.querySelectorAll("tbody td")].map((td) => td.textContent), ["bob"]);
	assert.equal(t.querySelector("tbody td"), bobCell); // bob's element reused, not rebuilt

	filter.q = ""; // show all again
	assert.equal(t.querySelectorAll("tbody tr").length, 3);
	assert.equal([...t.querySelectorAll("tbody td")].find((td) => td.textContent === "bob"), bobCell);
});

test("exposes the collection controller for pagination", () => {
	const { t } = basic({ page: state({ index: 0, size: 2 }) });

	assert.equal(t.querySelectorAll("tbody tr").length, 2);
	assert.equal(t.view.pageCount(), 2);
	assert.equal(t.view.total(), 3);
});

test("render (custom) cells re-run when the row's data is replaced (§2.3c)", () => {
	const store = state({ rows: [{ id: 1, blocked: false }] });
	const t = table({
		rows: () => store.rows,
		key: (r) => r.id,
		fields: [
			{ key: "action", label: "", render: (r) => el("button", {}, r.blocked ? "Unblock" : "Block") }
		]
	});

	assert.equal(t.querySelector("tbody button").textContent, "Block");

	// refetch: same key, mutated field — the action cell must reflect it
	store.rows = [{ id: 1, blocked: true }];
	assert.equal(t.querySelector("tbody button").textContent, "Unblock");
});

test("tablePager renders prev/pages/next, navigates, clamps, hides at ≤1 page", () => {
	const store = state({ rows: Array.from({ length: 25 }, (_u, i) => ({ id: i + 1 })) });
	const page = state({ index: 0, size: 10 });
	const t = table({ rows: () => store.rows, key: (r) => r.id, page, fields: [{ key: "id" }] });
	const pager = el("div", {}, tablePager(t.view));   // 25/10 = 3 pages

	const btns = () => [...pager.querySelectorAll("button")];
	// prev disabled on page 0
	assert.equal(btns()[0].disabled, true);
	// click page "2"
	btns().find((b) => b.textContent === "2").click();
	assert.equal(page.index, 1);
	// next to last
	btns().find((b) => b.textContent === "›").click();
	assert.equal(page.index, 2);
	// next clamped (disabled on last)
	assert.equal(btns().find((b) => b.textContent === "›").disabled, true);

	// one page → pager renders nothing
	const t2 = table({ rows: () => [{ id: 1 }], key: (r) => r.id, page: state({ index: 0, size: 10 }), fields: [{ key: "id" }] });
	const pager2 = el("div", {}, tablePager(t2.view));
	assert.equal(pager2.querySelectorAll("button").length, 0);
});

test("tableSummary shows Showing X–Y of Z, reactively", () => {
	const store = state({ rows: Array.from({ length: 25 }, (_u, i) => ({ id: i + 1 })) });
	const page = state({ index: 0, size: 10 });
	const t = table({ rows: () => store.rows, key: (r) => r.id, page, fields: [{ key: "id" }] });
	const summary = el("div", {}, tableSummary(t.view));

	assert.equal(summary.textContent, "Showing 1–10 of 25");
	page.index = 2;
	assert.equal(summary.textContent, "Showing 21–25 of 25");
	store.rows = [];
	assert.equal(summary.textContent, "No results");
});

test("custom header content renders and its clicks don't trigger sort", () => {
	const store = state({ rows: [{ id: 1 }, { id: 2 }] });
	let boxClicks = 0;
	const t = table({
		rows: () => store.rows, key: (r) => r.id,
		sort: state({ key: "id", dir: 1 }),
		fields: [
			{ key: "sel", sortable: true, header: () => el("input", { type: "checkbox", class: "all", onclick: () => boxClicks++ }) },
			{ key: "id", label: "ID" }
		]
	});
	const box = t.querySelector("thead .all");
	assert.ok(box, "custom header rendered");
	const sortBefore = t.view.sort.dir;
	box.click();
	assert.equal(boxClicks, 1);
	assert.equal(t.view.sort.dir, sortBefore, "header click did not sort");
});

test("dynamic fields (fields as thunk): toggling a column adds/removes header + cells, reuses row elements", () => {
	const cols = state({ email: true });
	const store = state({ rows: [{ id: 1, name: "Ada", email: "a@x" }, { id: 2, name: "Grace", email: "g@x" }] });
	const t = table({
		rows: () => store.rows, key: (r) => r.id,
		fields: () => [{ key: "name", label: "Name" }, ...(cols.email ? [{ key: "email", label: "Email" }] : [])]
	});

	const firstRowBefore = t.querySelector("tbody tr");
	assert.deepEqual([...t.querySelectorAll("thead th")].map((th) => th.textContent), ["Name", "Email"]);
	assert.equal(t.querySelectorAll("tbody tr:first-child td").length, 2);

	cols.email = false;
	assert.deepEqual([...t.querySelectorAll("thead th")].map((th) => th.textContent), ["Name"]);
	assert.equal(t.querySelectorAll("tbody tr:first-child td").length, 1);
	assert.equal(t.querySelector("tbody tr"), firstRowBefore, "row element reused across column change");
});

test("expandable rows: toggleRow + row click reveal/hide a detail panel", () => {
	const store = state({ rows: [{ id: 1, name: "Ada" }, { id: 2, name: "Grace" }] });
	const t = table({
		rows: () => store.rows, key: (r) => r.id,
		fields: [{ key: "name", label: "Name" }],
		expandable: (item) => el("div", { class: "detail" }, `about ${item.name}`)
	});

	assert.equal(t.querySelectorAll("tbody").length, 2, "one tbody per row group");
	assert.equal(t.querySelectorAll(".qrp-expand").length, 0);

	t.toggleRow(1);
	assert.equal(t.querySelectorAll(".qrp-expand").length, 1);
	assert.equal(t.querySelector(".detail").textContent, "about Ada");

	// clicking the row toggles it closed
	t.querySelector("tbody tr").click();
	assert.equal(t.querySelectorAll(".qrp-expand").length, 0);
});

test("expandable: clicking an interactive cell does NOT toggle the row", () => {
	const store = state({ rows: [{ id: 1, name: "Ada" }] });
	let acted = 0;
	const t = table({
		rows: () => store.rows, key: (r) => r.id,
		fields: [{ key: "act", render: () => el("button", { onclick: () => acted++ }, "Act") }],
		expandable: (item) => el("div", {}, item.name)
	});
	t.querySelector("tbody button").click();
	assert.equal(acted, 1);
	assert.equal(t.querySelectorAll(".qrp-expand").length, 0, "button click did not expand");
});

test("a PLAIN OBJECT sort option is still reactive (headers sort, arrow moves)", () => {
	const store = state({ rows: [
		{ id: "a", name: "b", count: 5 },
		{ id: "b", name: "a", count: 9 }
	] });

	// Not state({...}) — the shape the docs show, written as a literal. It used
	// to render the right INITIAL order and then ignore every header click: the
	// view only re-sorted when the data itself changed.
	const t = table({
		rows: () => store.rows,
		key: (r) => r.id,
		fields: [{ key: "name", label: "name", sortable: true }, { key: "count", label: "reqs", sortable: true }],
		sort: { key: "count", dir: -1 }
	});

	const order = () => [...t.querySelectorAll("tbody td:first-child")].map((td) => td.textContent).join(",");
	const headers = () => [...t.querySelectorAll("th")].map((th) => th.textContent.trim()).join("|");

	assert.equal(order(), "a,b", "initial sort applied (count desc)");
	assert.match(headers(), /reqs ▼/, "indicator starts on the initial column");

	t.querySelectorAll("th")[0].click();          // sort by name, ascending

	assert.match(headers(), /name ▲/, "the indicator moved to the clicked column");
	assert.doesNotMatch(headers(), /reqs ▼/, "and left the old one");

	t.querySelectorAll("th")[0].click();          // same column again → descending

	assert.equal(order(), "b,a", "a second click reverses immediately, without a data change");
	assert.match(headers(), /name ▼/);
});

test("a state() sort option keeps the caller's handle (identity, not a copy)", () => {
	const store = state({ rows: [{ id: 1, n: 1 }] });
	const sort = state({ key: "n", dir: 1 });
	const t = table({ rows: () => store.rows, key: (r) => r.id, fields: [{ key: "n", sortable: true }], sort });

	assert.equal(t.view.sort, sort, "the passed state object is used as-is");

	t.view.toggleSort("n");

	assert.equal(sort.dir, -1, "the caller's own reference sees the change");
});

test("an OPEN expandable panel refreshes when the row's item is replaced", () => {
	const store = state({ rows: [{ id: 1, n: 10 }] });
	const t = table({
		rows: () => store.rows, key: (r) => r.id,
		fields: [{ key: "n" }],
		expandable: (item) => el("div", { class: "detail" }, () => "n=" + item.n)
	});

	t.querySelector("tbody tr").click();
	assert.equal(t.querySelector(".detail").textContent, "n=10");

	// a refetch: same key, brand new object (the dashboard model)
	store.rows = [{ id: 1, n: 99 }];

	assert.equal(t.querySelector("tbody td").textContent, "99", "the cell updated");
	assert.equal(t.querySelector(".detail").textContent, "n=99", "and so did the open panel");
});

test("table classes: every part gets the qrp-* class plus the configured ones", () => {
	const rows = state({ list: [{ id: 1, name: "a", hot: true }, { id: 2, name: "b", hot: false }] });
	const t = table({
		rows: () => rows.list,
		class: "w-full",
		classes: {
			thead: "[&_tr]:border-b", headRow: "h-row", th: "h-10 px-2", tbody: "body",
			tr: (item) => (item.hot ? "hot" : "cold"), td: "p-2"
		},
		rowClass: () => "extra",
		fields: [{ key: "name", label: "Name", thClass: "col-name", tdClass: "cell-name" }]
	});

	assert.equal(t.className, "qrp-table w-full");
	assert.equal(t.querySelector("thead").className, "[&_tr]:border-b");
	assert.equal(t.querySelector("thead tr").className, "h-row");
	assert.equal(t.querySelector("th").className, "qrp-th h-10 px-2 col-name");
	assert.equal(t.querySelector("tbody").className, "body");

	const trs = t.querySelectorAll("tbody tr");

	assert.equal(trs[0].className, "hot extra");
	assert.equal(trs[1].className, "cold extra");
	assert.equal(trs[0].querySelector("td").className, "p-2 cell-name");
});

test("table classes on expandable rows", () => {
	const t = table({
		rows: [{ id: 1, name: "a" }],
		classes: { tbody: "group", expandRow: "detail", expandCell: "detail-cell" },
		expandable: (item) => `details of ${item.name}`,
		fields: [{ key: "name", label: "Name" }]
	});

	assert.equal(t.querySelector("tbody").className, "qrp-rowgroup group");
	t.toggleRow(1);
	assert.equal(t.querySelector("tr.qrp-expand").className, "qrp-expand detail");
	assert.equal(t.querySelector("tr.qrp-expand td").className, "detail-cell");
});

test("table sortIndicator replaces the arrows and aria-sort tracks the sort", () => {
	const t = table({
		rows: [{ id: 1, n: 2 }, { id: 2, n: 1 }],
		sortIndicator: (dir) => el("i", { "data-dir": String(dir) }),
		fields: [{ key: "n", label: "N", sortable: true }, { key: "id", label: "Id", sortable: true }]
	});
	const [nHead, idHead] = t.querySelectorAll("th");

	assert.equal(nHead.querySelector("i").dataset.dir, "0");
	assert.equal(nHead.hasAttribute("aria-sort"), false);

	nHead.click();
	assert.equal(nHead.querySelector("i").dataset.dir, "1");
	assert.equal(nHead.getAttribute("aria-sort"), "ascending");
	assert.equal(idHead.querySelector("i").dataset.dir, "0");

	nHead.click();
	assert.equal(nHead.querySelector("i").dataset.dir, "-1");
	assert.equal(nHead.getAttribute("aria-sort"), "descending");
	assert.equal(nHead.textContent.includes("▼"), false, "no default arrows with a custom indicator");
});

test("tablePager classes", () => {
	const t = table({
		rows: Array.from({ length: 25 }, (_, i) => ({ id: i })),
		page: state({ index: 0, size: 5 }),
		fields: [{ key: "id", label: "Id" }]
	});
	const nav = tablePager(t.view, { classes: { nav: "flex", button: "btn", active: "btn-active", gap: "dots" } });

	assert.equal(nav.className, "qrp-pager flex");

	const active = nav.querySelector("[aria-current=page]");

	assert.equal(active.className, "qrp-pager-btn btn active btn-active");
	assert.equal(nav.querySelector(".qrp-pager-gap").className, "qrp-pager-gap dots");
});

// --- view (shared collection / dataGrid) and attrs hooks --------------------

test("table({ view }) renders through a shared collection instead of building its own", () => {
	const store = state({ rows: [{ id: 1, n: "b" }, { id: 2, n: "a" }, { id: 3, n: "c" }] });
	const shared = collection(() => store.rows, {
		sort: { key: "n", dir: 1 },
		page: state({ index: 0, size: 2 }),
		compare: (a, b, sort) => (a[sort.key] > b[sort.key] ? 1 : -1) * sort.dir
	});
	const t = table({ view: shared, rows: () => [], fields: [{ key: "n", label: "N", sortable: true }] });
	const cells = () => [...t.querySelectorAll("tbody td")].map((td) => td.textContent);

	assert.ok(t.view === shared, "the table exposes the shared view, not a copy");
	assert.deepEqual(cells(), ["a", "b"], "rows/sort/page come from the view; the rows option is ignored");

	shared.page.index = 1;
	assert.deepEqual(cells(), ["c"], "paging the shared view pages the table");

	shared.page.index = 0;
	t.querySelector("th").click();
	assert.equal(shared.sort.dir, -1, "header clicks sort the shared view");
	assert.deepEqual(cells(), ["c", "b"]);
});

test("table({ view: dataGrid }) — grid selection drives row attrs", () => {
	const rows = [{ id: 1, n: "a" }, { id: 2, n: "b" }];
	const grid = dataGrid(() => rows, { key: (r) => r.id, pageSizes: [] });
	const t = table({
		view: grid,
		key: (r) => r.id,
		fields: [{ key: "n", label: "N" }],
		attrs: {
			tr: (item) => ({ "data-state": grid.isSelected(item) ? "selected" : null, "aria-selected": grid.isSelected(item) }),
			td: (column) => ({ "data-label": column.label }),
			th: (column) => ({ scope: "col", "data-key": column.key })
		}
	});
	const [first] = t.querySelectorAll("tbody tr");

	assert.equal(first.hasAttribute("data-state"), false);
	assert.equal(first.hasAttribute("aria-selected"), false, "false removes the attribute");
	grid.toggle(rows[0]);
	assert.equal(first.getAttribute("data-state"), "selected");
	assert.equal(first.getAttribute("aria-selected"), "");
	grid.toggle(rows[0]);
	assert.equal(first.hasAttribute("data-state"), false, "attributes follow the selection back off");
	assert.equal(t.querySelector("tbody td").getAttribute("data-label"), "N");
	assert.equal(t.querySelector("th").getAttribute("scope"), "col");
	assert.equal(t.querySelector("th").getAttribute("data-key"), "n");
});

test("attrs: an attribute the hook stops returning is removed", () => {
	const flag = state({ on: true });
	const t = table({
		rows: [{ id: 1, n: "a" }],
		fields: [{ key: "n", label: "N" }],
		attrs: { tr: () => (flag.on ? { "data-x": "1" } : {}) }
	});
	const tr = t.querySelector("tbody tr");

	assert.equal(tr.getAttribute("data-x"), "1");
	flag.on = false;
	assert.equal(tr.hasAttribute("data-x"), false);
});

test("tableSummary + tablePager use the clamped page after a filter shrinks the set", () => {
	const store = state({ rows: Array.from({ length: 100 }, (_u, i) => ({ id: i + 1 })) });
	const filter = state({ max: 100 });
	const page = state({ index: 9, size: 10 });
	const t = table({
		rows: () => store.rows,
		key: (r) => r.id,
		page,
		filter,
		filterFn: (r, f) => r.id <= f.max,
		fields: [{ key: "id" }]
	});
	const summary = el("div", {}, tableSummary(t.view));
	const pager = el("div", {}, tablePager(t.view));
	const btns = () => [...pager.querySelectorAll("button")];
	const btn = (text) => btns().find((b) => b.textContent === text);

	assert.equal(summary.textContent, "Showing 91–100 of 100");

	filter.max = 25;   // 3 pages, still parked on index 9
	assert.equal(summary.textContent, "Showing 21–25 of 25");
	assert.equal(btn("3").getAttribute("aria-current"), "page", "last page is the active one");
	assert.equal(btn("›").disabled, true, "next disabled on the (clamped) last page");
	assert.equal(t.querySelector("tbody td").textContent, "21");

	btn("‹").click();
	assert.equal(page.index, 1, "prev moves to the page before the one shown");
	assert.equal(summary.textContent, "Showing 11–20 of 25");
});
