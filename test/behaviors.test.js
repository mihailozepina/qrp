import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { effect, el, scoped, state } from "../qrp/index.js";
import { portal } from "../behaviors/portal.js";
import { dismissable } from "../behaviors/dismissable.js";
import { trapFocus } from "../behaviors/trap-focus.js";
import { anchored, pointAt } from "../behaviors/anchored.js";
import { disclosure } from "../behaviors/disclosure.js";
import { busyWhile } from "../behaviors/busy-while.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const key = (name, extra = {}) => Object.assign(new Event("keydown", { bubbles: true }), { key: name, ...extra });

// --- portal -----------------------------------------------------------------

test("portal moves a node to a target and dispose removes it", () => {
	const node = el("div", {}, "hi");
	const target = document.createElement("section");
	document.body.appendChild(target);

	const dispose = portal(node, target);
	assert.equal(node.parentNode, target);

	dispose();
	assert.equal(node.parentNode, null);
});

// --- dismissable ------------------------------------------------------------

test("dismissable fires on Escape", () => {
	const node = el("div", {});
	document.body.appendChild(node);

	let dismissed = 0;
	const dispose = dismissable(node, () => { dismissed++; });

	document.dispatchEvent(key("Escape"));
	assert.equal(dismissed, 1);

	dispose();
	document.dispatchEvent(key("Escape"));
	assert.equal(dismissed, 1); // no longer listening
});

test("dismissable fires on outside pointerdown but not inside", async () => {
	const node = el("div", {}, el("button", {}, "inside"));
	document.body.appendChild(node);

	let dismissed = 0;
	const dispose = dismissable(node, () => { dismissed++; });

	await tick(); // outside listener attaches on next tick

	// inside: no dismiss
	node.querySelector("button").dispatchEvent(new Event("pointerdown", { bubbles: true }));
	assert.equal(dismissed, 0);

	// outside: dismiss
	document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
	assert.equal(dismissed, 1);

	dispose();
});

test("dismissable: Escape closes only the topmost layer", () => {
	const outer = el("div", {});
	const inner = el("div", {});
	const closed = [];

	document.body.append(outer, inner);

	const undoOuter = dismissable(outer, () => closed.push("outer"));
	const undoInner = dismissable(inner, () => { closed.push("inner"); undoInner(); });

	document.dispatchEvent(key("Escape"));
	assert.deepEqual(closed, ["inner"]);

	document.dispatchEvent(key("Escape"));
	assert.deepEqual(closed, ["inner", "outer"]);

	undoOuter();
	outer.remove();
	inner.remove();
});

test("dismissable: a click inside a nested (later) layer dismisses neither", async () => {
	const dialog = el("div", {}, el("p", {}, "dialog body"));
	const popover = el("div", {}, el("button", {}, "item"));   // portaled elsewhere
	const closed = [];

	document.body.append(dialog, popover);

	const undoDialog = dismissable(dialog, () => closed.push("dialog"));
	const undoPopover = dismissable(popover, () => { closed.push("popover"); undoPopover(); });

	await tick();

	popover.querySelector("button").dispatchEvent(new Event("pointerdown", { bubbles: true }));
	assert.deepEqual(closed, [], "inside the top layer: nothing closes");

	dialog.querySelector("p").dispatchEvent(new Event("pointerdown", { bubbles: true }));
	assert.deepEqual(closed, ["popover"], "inside the dialog: only the popover above it closes");

	document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
	assert.deepEqual(closed, ["popover", "dialog"]);

	undoDialog();
	dialog.remove();
	popover.remove();
});

test("dismissable: `inside` nodes and `modal` layers", async () => {
	const trigger = el("button", {}, "open");
	const menu = el("div", {});
	const below = el("div", {});
	const modal = el("div", {});
	const closed = [];

	document.body.append(trigger, menu, below, modal);

	const undoMenu = dismissable(menu, () => closed.push("menu"), { inside: [trigger] });

	await tick();
	trigger.dispatchEvent(new Event("pointerdown", { bubbles: true }));
	assert.deepEqual(closed, [], "the trigger counts as inside");
	undoMenu();

	const undoBelow = dismissable(below, () => closed.push("below"));
	const undoModal = dismissable(modal, () => closed.push("modal"), { modal: true });

	await tick();
	document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
	assert.deepEqual(closed, ["modal"], "the walk stops at a modal layer");

	undoBelow();
	undoModal();
	[trigger, menu, below, modal].forEach((node) => node.remove());
});

test("dismissable: the opening click (same tick) is not an outside click", () => {
	const node = el("div", {});
	let dismissed = 0;

	document.body.append(node);

	const undo = dismissable(node, () => { dismissed++; });

	document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
	assert.equal(dismissed, 0);

	undo();
	node.remove();
});

// --- trapFocus --------------------------------------------------------------

test("trapFocus focuses the first focusable and restores on dispose", () => {
	const before = el("input", { type: "text" });
	document.body.appendChild(before);
	before.focus();

	const modal = el("div", {}, el("button", {}, "a"), el("button", {}, "b"));
	document.body.appendChild(modal);

	const dispose = trapFocus(modal);
	assert.equal(document.activeElement, modal.querySelectorAll("button")[0]);

	dispose();
	assert.equal(document.activeElement, before); // focus restored
});

test("trapFocus wraps Tab from last to first", () => {
	const modal = el("div", {}, el("button", {}, "a"), el("button", {}, "b"));
	document.body.appendChild(modal);

	trapFocus(modal);
	const [first, last] = modal.querySelectorAll("button");

	last.focus();
	modal.dispatchEvent(key("Tab"));
	assert.equal(document.activeElement, first);
});

const tab = (extra = {}) => Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "Tab", ...extra });

const dialogWith = (trailing) => {
	const modal = document.createElement("div");
	modal.innerHTML = `<input><button id="ok">OK</button>${trailing}`;
	document.body.appendChild(modal);

	return modal;
};

test("trapFocus wraps Tab when the last focusable-looking element has tabindex=-1", () => {
	const modal = dialogWith("<button tabindex=\"-1\">skip</button>");
	const dispose = trapFocus(modal);
	const first = modal.querySelector("input");

	modal.querySelector("#ok").focus();
	const event = tab();
	modal.dispatchEvent(event);

	assert.equal(event.defaultPrevented, true, "focus must not escape the trap");
	assert.equal(document.activeElement, first);

	dispose();
	modal.remove();
});

test("trapFocus wraps Tab past hidden and inert trailing elements", () => {
	const modal = dialogWith("<button hidden>h</button><div inert><button>i</button></div><div hidden><a href=\"#\">x</a></div>");
	const dispose = trapFocus(modal);

	modal.querySelector("#ok").focus();
	const event = tab();
	modal.dispatchEvent(event);

	assert.equal(event.defaultPrevented, true);
	assert.equal(document.activeElement, modal.querySelector("input"));

	dispose();
	modal.remove();
});

test("trapFocus Shift+Tab from first wraps to the last tabbable element", () => {
	const modal = dialogWith("<button tabindex=\"-1\">skip</button><button hidden>h</button>");
	const dispose = trapFocus(modal);
	const first = modal.querySelector("input");

	assert.equal(document.activeElement, first);
	const event = tab({ shiftKey: true });
	modal.dispatchEvent(event);

	assert.equal(event.defaultPrevented, true);
	assert.equal(document.activeElement, modal.querySelector("#ok"));

	dispose();
	modal.remove();
});

// --- anchored ---------------------------------------------------------------

test("anchored positions the floating element (fixed) and dispose is a fn", () => {
	const trigger = el("button", {}, "open");
	const floating = el("div", {}, "menu");
	document.body.appendChild(trigger);
	document.body.appendChild(floating);

	const dispose = anchored(trigger, floating);
	assert.equal(floating.style.position, "fixed");
	assert.equal(typeof dispose, "function");
	assert.equal(typeof dispose.update, "function");

	dispose();
});

// A stand-in rect: happy-dom has no layout.
const rect = (left, top, width, height) => ({
	left, top, width, height, right: left + width, bottom: top + height, x: left, y: top
});

const placed = (triggerRect, floatingSize, options) => {
	const trigger = { getBoundingClientRect: () => triggerRect };
	const floating = el("div", {});

	floating.getBoundingClientRect = () => rect(0, 0, floatingSize[0], floatingSize[1]);
	document.body.append(floating);

	const dispose = anchored(trigger, floating, options);
	const result = {
		top: parseFloat(floating.style.top),
		left: parseFloat(floating.style.left),
		side: floating.dataset.side,
		align: floating.dataset.align,
		origin: floating.style.getPropertyValue("--qrp-transform-origin"),
		anchorWidth: floating.style.getPropertyValue("--qrp-anchor-width")
	};

	dispose();
	floating.remove();

	return result;
};

test("anchored defaults: below the trigger, left edges aligned, 4px gap", () => {
	const at = placed(rect(100, 100, 80, 30), [120, 60]);

	assert.deepEqual([at.top, at.left, at.side, at.align], [134, 100, "bottom", "start"]);
	assert.equal(at.anchorWidth, "80px");
	assert.equal(at.origin, "left top");
});

test("anchored: side + align + offsets", () => {
	const right = placed(rect(100, 100, 80, 30), [120, 60], { side: "right", align: "center", sideOffset: 8 });

	assert.deepEqual([right.left, right.top, right.side], [188, 85, "right"]);

	const top = placed(rect(100, 300, 80, 30), [120, 60], { side: "top", align: "end", alignOffset: 2 });

	assert.deepEqual([top.top, top.left, top.side, top.align], [236, 58, "top", "end"]);
	assert.equal(top.origin, "right bottom");
});

test("anchored: flips when the preferred side doesn't fit, shifts on the cross axis", () => {
	const flipped = placed(rect(100, window.innerHeight - 40, 80, 30), [120, 100]);

	assert.equal(flipped.side, "top");
	assert.equal(flipped.top, window.innerHeight - 40 - 100 - 4);

	const shifted = placed(rect(window.innerWidth - 50, 100, 40, 30), [120, 60]);

	assert.equal(shifted.left, window.innerWidth - 120, "kept on screen");

	const pinned = placed(rect(100, window.innerHeight - 40, 80, 30), [120, 100], { avoidCollisions: false });

	assert.equal(pinned.side, "bottom");
});

test("anchored: `placement` and `gap` still work (older names)", () => {
	const at = placed(rect(100, 300, 80, 30), [120, 60], { placement: "top", gap: 10 });

	assert.deepEqual([at.top, at.side], [230, "top"]);
});

test("anchored: pointAt anchors at a viewport point", () => {
	const floating = el("div", {});

	floating.getBoundingClientRect = () => rect(0, 0, 100, 50);
	document.body.append(floating);

	const dispose = anchored(pointAt(200, 150), floating, { sideOffset: 0 });

	assert.equal(floating.style.top, "150px");
	assert.equal(floating.style.left, "200px");
	dispose();
	floating.remove();
});

// --- disclosure -------------------------------------------------------------

test("disclosure toggles reactive state and wires aria", () => {
	const d = disclosure(false);

	let seen;
	effect(() => { seen = d.state.open; });
	assert.equal(seen, false);

	const trigger = el("button", {});
	const panel = el("div", {});
	d.connect(trigger, panel);

	assert.equal(trigger.getAttribute("aria-expanded"), "false");
	assert.equal(panel.hidden, true);

	trigger.click();
	assert.equal(seen, true);
	assert.equal(trigger.getAttribute("aria-expanded"), "true");
	assert.equal(panel.hidden, false);
});

test("disclosure connect: data-state, aria-controls, hide: false, disabled", () => {
	const d = disclosure(false);
	const trigger = el("button", {});
	const panel = el("div", {});
	const locked = state({ on: true });

	d.connect(trigger, panel, { hide: false, disabled: () => locked.on });

	assert.ok(panel.id, "panel gets an id");
	assert.equal(trigger.getAttribute("aria-controls"), panel.id);
	assert.equal(panel.dataset.state, "closed");
	assert.equal(panel.hidden, false, "hide: false leaves visibility to CSS");

	trigger.click();
	assert.equal(d.state.open, false, "disabled ignores clicks");

	locked.on = false;
	trigger.click();
	assert.equal(d.state.open, true);
	assert.equal(trigger.dataset.state, "open");
	assert.equal(panel.dataset.state, "open");
});

test("disclosure bound to [state, key] is two-way and reports onChange", () => {
	const ui = state({ filters: false });
	const changes = [];
	const d = disclosure([ui, "filters"], { onChange: (open) => changes.push(open) });

	let seen;
	effect(() => { seen = d.state.open; });

	d.open();
	assert.equal(ui.filters, true);
	assert.equal(seen, true);

	ui.filters = false;
	assert.equal(d.state.open, false);
	assert.equal(seen, false);
	assert.deepEqual(changes, [true]);
});

test("disclosure driven by a thunk only reports requests", () => {
	const ui = state({ open: false });
	const requests = [];
	const d = disclosure(() => ui.open, { onChange: (open) => requests.push(open) });

	d.toggle();
	assert.equal(ui.open, false, "the owner decides");
	assert.deepEqual(requests, [true]);

	ui.open = true;
	assert.equal(d.state.open, true);
});

// --- busyWhile --------------------------------------------------------------

test("busyWhile tracks in-flight promises reactively", () => {
	const b = busyWhile();
	assert.equal(b.active, false);

	let resolve;
	const p = b.run(new Promise((r) => { resolve = r; }));
	assert.equal(b.state.pending, 1);
	assert.equal(b.active, true);

	resolve();
	return p.then(() => {
		assert.equal(b.state.pending, 0);
		assert.equal(b.active, false);
	});
});

test("busyWhile.run() inside an effect doesn't subscribe it to the counter", async () => {
	const b = busyWhile();
	const f = state({ q: 1 });
	let runs = 0;

	const stop = effect(() => {
		void f.q;
		runs += 1;
		b.run(new Promise((r) => setTimeout(r, 5)));
	});

	try {
		await new Promise((r) => setTimeout(r, 30));
		assert.equal(runs, 1, "run() must not re-trigger its caller");

		f.q = 2;
		assert.equal(runs, 2, "the effect still reacts to its own deps");
	} finally {
		stop();
	}

	await new Promise((r) => setTimeout(r, 10));
	assert.equal(b.state.pending, 0);
});

test("busyWhile counter stays reactive for outside readers", async () => {
	const b = busyWhile();
	const seen = [];
	const stop = effect(() => { seen.push(b.active); });

	await b.run(Promise.resolve());
	assert.deepEqual(seen, [false, true, false]);
	stop();
});

// --- scope auto-registration (dispose() cleans up behaviors too) ------------

test("behaviors built inside scoped() are torn down by dispose() alone", () => {
	const node = el("div", {}, "modal");
	const trigger = el("button", {}, "open");
	document.body.append(trigger);

	let onDismiss;
	const { dispose } = scoped(() => {
		portal(node);                                  // moves node into body
		dismissable(node, () => {}, { escape: true }); // adds document listeners
		anchored(trigger, node);                       // adds window listeners
		onDismiss = true;
	});

	assert.equal(onDismiss, true);
	assert.equal(node.parentNode, document.body, "portal attached the node");

	// dispose() alone should undo ALL three behaviors (no manual undo tracking)
	dispose();
	assert.equal(node.parentNode, null, "portal teardown ran on dispose");

	trigger.remove();
});

test("a behavior undo is idempotent (manual call + scope dispose is safe)", () => {
	const node = el("div", {}, "x");
	let undo;
	const { dispose } = scoped(() => { undo = portal(node); });

	assert.equal(node.parentNode, document.body);
	undo();                                   // manual teardown
	assert.equal(node.parentNode, null);
	assert.doesNotThrow(() => dispose());     // scope dispose runs it again — no-op
});
