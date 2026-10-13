import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, effect } from "../qrp/index.js";
import { dataGrid } from "../datagrid/index.js";

const rows = () => [
	{ id: 1, name: "Ada", team: "core" },
	{ id: 2, name: "Bea", team: "core" },
	{ id: 3, name: "Cy", team: "ops" },
	{ id: 4, name: "Dot", team: "ops" },
	{ id: 5, name: "Eve", team: "ops" }
];

test("selection: toggle, selectAll/clear, all/some (indeterminate)", () => {
	const store = state({ rows: rows() });
	const grid = dataGrid(() => store.rows, { key: r => r.id, pageSizes: [] });

	assert.equal(grid.allSelected(), false);
	assert.equal(grid.someSelected(), false);

	grid.toggle(store.rows[0]);
	assert.equal(grid.isSelected(store.rows[0]), true);
	assert.equal(grid.someSelected(), true, "one of five → indeterminate");
	assert.equal(grid.allSelected(), false);

	grid.toggle(store.rows[0]);
	assert.equal(grid.isSelected(store.rows[0]), false);

	grid.selectAll();
	assert.equal(grid.allSelected(), true);
	assert.equal(grid.someSelected(), false, "all selected → not indeterminate");
	assert.equal(grid.selectedItems().length, 5);

	grid.clearSelection();
	assert.equal(grid.selectedIds().length, 0);
});

test("selection is keyed, so it survives row-object replacement (refetch)", () => {
	const store = state({ rows: rows() });
	const grid = dataGrid(() => store.rows, { key: r => r.id, pageSizes: [] });

	grid.select(store.rows[1]);          // id 2
	assert.equal(grid.selectedIds().length, 1);

	// refetch: brand-new row objects, same ids
	store.rows = rows();
	assert.equal(grid.isSelected(store.rows[1]), true, "still selected by id");
	assert.deepEqual(grid.selectedItems().map(r => r.id), [2]);
});

test("selectAll selects only the filtered set", () => {
	const store = state({ rows: rows() });
	const grid = dataGrid(() => store.rows, {
		key: r => r.id,
		pageSizes: [],
		filter: state({ team: "ops" }),
		filterFn: (r, f) => r.team === f.team
	});

	grid.selectAll();
	assert.deepEqual(grid.selectedItems().map(r => r.id).sort(), [3, 4, 5], "only ops rows");
	assert.equal(grid.allSelected(), true, "all of the filtered set");
});

test("column visibility toggles", () => {
	const grid = dataGrid(rows, {
		columns: [{ key: "name" }, { key: "team", hidden: true }],
		pageSizes: []
	});

	assert.equal(grid.isVisible("name"), true);
	assert.equal(grid.isVisible("team"), false, "starts hidden");
	assert.deepEqual(grid.visibleColumns().map(c => c.key), ["name"]);

	grid.toggleColumn("team");
	assert.equal(grid.isVisible("team"), true);
	assert.deepEqual(grid.visibleColumns().map(c => c.key), ["name", "team"]);
});

test("paging: default size adopted, setPageSize resets to page 0, windowed pager", () => {
	const many = () => Array.from({ length: 95 }, (_, i) => ({ id: i, name: "n" + i }));
	const grid = dataGrid(many, { key: r => r.id, pageSizes: [10, 25] });

	assert.equal(grid.page.size, 10, "adopted first page size");
	assert.equal(grid.pageCount(), 10);

	grid.goto(5);
	assert.equal(grid.page.index, 5);

	grid.setPageSize(25);
	assert.equal(grid.page.size, 25);
	assert.equal(grid.page.index, 0, "resize jumps to first page");
	assert.equal(grid.pageCount(), 4);

	grid.goto(2);
	assert.deepEqual(grid.pageWindow(3), [1, 2, 3], "window centered on current");
	grid.goto(0);
	assert.deepEqual(grid.pageWindow(3), [0, 1, 2], "clamped at the start");
	grid.goto(3);
	assert.deepEqual(grid.pageWindow(3), [1, 2, 3], "clamped at the end");
});

test("prev/next/hasPrev/hasNext/pageWindow use the clamped page after a filter shrinks the set", () => {
	const many = Array.from({ length: 100 }, (_, i) => ({ id: i }));
	const filter = state({ max: 100 });
	const grid = dataGrid(() => many, { key: r => r.id, pageSizes: [10], filter, filterFn: (r, f) => r.id < f.max });

	grid.goto(9);
	filter.max = 25;   // 3 pages left; raw index still 9

	assert.equal(grid.pageIndex(), 2);
	assert.equal(grid.hasNext(), false);
	assert.equal(grid.hasPrev(), true);
	assert.deepEqual(grid.pageWindow(3), [0, 1, 2]);

	grid.prev();
	assert.equal(grid.page.index, 1, "prev goes to the page before the one shown");
	assert.equal(grid.items()[0].id, 10);

	grid.goto(9);
	grid.next();
	assert.equal(grid.page.index, 2, "next from the clamped last page stays on it");
});

test("an explicit page option is honored (no default size forced)", () => {
	const grid = dataGrid(rows, { key: r => r.id, page: state({ index: 0, size: 0 }) });

	assert.equal(grid.page.size, 0, "explicit no-paging respected");
	assert.equal(grid.items().length, 5);
});

test("selection state is reactive", () => {
	const store = state({ rows: rows() });
	const grid = dataGrid(() => store.rows, { key: r => r.id, pageSizes: [] });

	let count;
	effect(() => { count = grid.selectedItems().length; });
	assert.equal(count, 0);

	grid.toggle(store.rows[0]);
	assert.equal(count, 1, "effect re-ran on selection change");
});

test("selectAll / clearSelection / toggleAll / setPageSize run dependents once (batched)", () => {
	const rows = Array.from({ length: 50 }, (_, i) => ({ id: i }));
	const grid = dataGrid(() => rows, { key: (r) => r.id, pageSizes: [] });
	let runs = 0;

	effect(() => {
		grid.selectedIds().length;
		runs += 1;
	});

	runs = 0;
	grid.selectAll();
	assert.equal(runs, 1, "one effect run for 50 selections");
	assert.equal(grid.selectedIds().length, 50);

	runs = 0;
	grid.clearSelection();
	assert.equal(runs, 1);

	runs = 0;
	grid.toggleAll();
	assert.equal(runs, 1);

	let pageRuns = 0;

	effect(() => {
		grid.view.page.size;
		grid.view.page.index;
		pageRuns += 1;
	});

	pageRuns = 0;
	grid.setPageSize(25);
	assert.equal(pageRuns, 1);
});
