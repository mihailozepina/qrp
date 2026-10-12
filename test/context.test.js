import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { state, el, list, effect } from "../qrp/index.js";
import { createContext, setOwner, ownerOf } from "../context/index.js";
import { portal } from "../behaviors/portal.js";

const microtask = () => new Promise((resolve) => queueMicrotask(resolve));

test("read returns the nearest provided value, or the fallback", () => {
	const Theme = createContext("light");
	const leaf = el("span");
	const inner = el("div", {}, leaf);
	const outer = el("section", {}, inner);

	assert.equal(Theme.read(leaf), "light");
	Theme.provide(outer, "dark");
	assert.equal(Theme.read(leaf), "dark");
	Theme.provide(inner, "blue");
	assert.equal(Theme.read(leaf), "blue", "nearest provider wins");
	assert.equal(Theme.read(outer), "dark", "the provider node itself is included");
	assert.ok(Theme.find(leaf).provider === inner);
});

test("a reactive read during construction resolves once the parent provides", () => {
	const Tabs = createContext(null);
	const ctrl = state({ value: "a" });
	const trigger = (value) => Tabs.watch(el("button"), (tabs, node) => {
		node.setAttribute("aria-selected", String(tabs?.value === value));
	});

	// Children first, provider last — exactly how JS evaluates the composition.
	const a = trigger("a");
	const b = trigger("b");

	assert.equal(a.getAttribute("aria-selected"), "false", "no provider yet");

	Tabs.provide(el("div", {}, a, b), ctrl);
	assert.equal(a.getAttribute("aria-selected"), "true");
	assert.equal(b.getAttribute("aria-selected"), "false");

	ctrl.value = "b";
	assert.equal(b.getAttribute("aria-selected"), "true", "and stays reactive to the provided state");
});

test("rows a list() inserts later resolve the context on the microtask retry", async () => {
	const Group = createContext("none");
	const rows = state({ items: [] });
	const host = document.createElement("div");

	document.body.append(host);

	const root = Group.provide(el("ul", {}, list(() => rows.items, (r) => r, (r) => Group.watch(el("li"), (group, node) => {
		node.textContent = `${r}:${group}`;
	}))), "g1");

	host.append(root);
	rows.items = ["x", "y"];
	await microtask();
	await microtask();
	assert.deepEqual([...root.querySelectorAll("li")].map((li) => li.textContent), ["x:g1", "y:g1"]);
	host.remove();
});

test("a node that never attaches gets exactly one retry (no loop)", async () => {
	const Ctx = createContext("fallback");
	const node = el("span");
	let runs = 0;

	effect(() => {
		runs += 1;
		Ctx.read(node);
	});

	await microtask();
	await microtask();
	await microtask();
	assert.equal(runs, 2, "initial run + one retry");
});

test("portaled content resolves through where it came from, or an explicit owner", () => {
	const Menu = createContext(null);
	const trigger = el("button");
	const provider = Menu.provide(el("div", {}, trigger), "menu-1");
	const content = el("div");
	const nested = el("div");

	document.body.append(provider);
	provider.append(nested);

	const undoA = portal(content, document.body, { owner: trigger });
	const undoB = portal(nested);

	assert.ok(ownerOf(content) === trigger);
	assert.equal(Menu.read(content), "menu-1", "explicit owner");
	assert.equal(Menu.read(nested), "menu-1", "previous parent recorded by portal()");

	setOwner(content, null);
	assert.equal(Menu.read(content), null, "clearing the owner falls back to the DOM");
	undoA();
	undoB();
	provider.remove();
});
