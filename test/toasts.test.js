import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { el, mount } from "../qrp/index.js";
import { emitter } from "../events/index.js";
import { createToasts } from "../toasts/index.js";

// Each test gets its own emitter so the global bus isn't shared across tests.
const setup = (options = {}) => {
	const bus = emitter();
	const ctl = createToasts({ bus, timeout: 0, ...options });

	const root = document.createElement("div");
	mount(root, ctl.component);

	return { bus, ctl, root };
};

test("string toast renders with title and body", () => {
	const { ctl, root } = setup();

	ctl.success("Saved");

	const toast = root.querySelector(".qrp-toast-success");
	assert.ok(toast);
	assert.equal(toast.querySelector(".qrp-toast-title").textContent, "Success");
	assert.equal(toast.querySelector(".qrp-toast-body").textContent, "Saved");
});

test("error and success are distinct variants", () => {
	const { ctl, root } = setup();

	ctl.error("Boom");
	ctl.success("Yay");

	assert.equal(root.querySelectorAll(".qrp-toast-error").length, 1);
	assert.equal(root.querySelectorAll(".qrp-toast-success").length, 1);
});

test("renderable node content is rendered", () => {
	const { ctl, root } = setup();

	ctl.error(el("a", { href: "/logs" }, "see logs"));

	const link = root.querySelector(".qrp-toast-body a");
	assert.ok(link);
	assert.equal(link.getAttribute("href"), "/logs");
	assert.equal(link.textContent, "see logs");
});

test("thunk content builds fresh nodes (safe for reuse)", () => {
	const { ctl, root } = setup();

	const make = () => el("strong", {}, "retry");

	ctl.info(make);
	ctl.info(make);

	// Two independent nodes, one per toast — not the same node moved.
	const strongs = root.querySelectorAll(".qrp-toast-body strong");
	assert.equal(strongs.length, 2);
	assert.notEqual(strongs[0], strongs[1]);
});

test("duplicate string messages are deduped within the window", () => {
	const { ctl, root } = setup({ dedupeWindow: 1000 });

	ctl.error("Timeout");
	ctl.error("Timeout");
	ctl.error("Timeout");

	assert.equal(root.querySelectorAll(".qrp-toast-error").length, 1);
});

test("custom title via meta", () => {
	const { ctl, root } = setup();

	ctl.warning("Low battery", { title: "Heads up" });

	assert.equal(root.querySelector(".qrp-toast-title").textContent, "Heads up");
});

test("bus events raise toasts (global event pipe)", () => {
	const { bus, root } = setup();

	bus.emit("success", { message: "Via bus" });
	bus.emit("error", "Bare string too");

	assert.equal(root.querySelector(".qrp-toast-success .qrp-toast-body").textContent, "Via bus");
	assert.equal(root.querySelector(".qrp-toast-error .qrp-toast-body").textContent, "Bare string too");
});

test("dismiss removes a toast", () => {
	const { ctl, root } = setup();

	ctl.info("Note");
	const before = root.querySelectorAll(".qrp-toast").length;
	assert.equal(before, 1);

	const id = ctl.store.items[0].id;
	ctl.dismiss(id);

	assert.equal(root.querySelectorAll(".qrp-toast").length, 0);
});

test("auto-dismiss after timeout", async () => {
	const { ctl, root } = setup({ timeout: 30 });

	ctl.info("Fleeting");
	assert.equal(root.querySelectorAll(".qrp-toast").length, 1);

	await new Promise((resolve) => setTimeout(resolve, 60));

	assert.equal(root.querySelectorAll(".qrp-toast").length, 0);
});

// --- ids, update, per-toast duration, pause/resume, exit phase -------------

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("push returns the id; meta.id updates the live toast instead of adding", () => {
	const { ctl, root } = setup();

	const id = ctl.push("loading", "Saving…", { id: "save" });

	assert.equal(id, "save");
	assert.equal(ctl.push("success", "Saved", { id: "save" }), "save");
	assert.equal(ctl.store.items.length, 1);
	assert.equal(root.querySelector(".qrp-toast-success .qrp-toast-body").textContent, "Saved");
	assert.equal(typeof ctl.info("x"), "number");
});

test("extra meta fields stay on the item; update merges reactively", () => {
	const { ctl, root } = setup();
	const id = ctl.push("info", "Event created", { description: "Sunday 9am", action: { label: "Undo" } });
	const item = ctl.store.items[0];

	assert.equal(item.description, "Sunday 9am");
	assert.equal(item.action.label, "Undo");
	assert.equal(ctl.update(id, { content: "Event moved", variant: "warning" }), true);
	assert.equal(root.querySelector(".qrp-toast-body").textContent, "Event moved");
	assert.ok(root.querySelector(".qrp-toast-warning"), "variant change re-renders the class");
	assert.equal(root.querySelector(".qrp-toast-title").textContent, "Warning", "a default title follows the variant");
	assert.equal(ctl.update(999, { content: "nope" }), false);
});

test("duplicate string messages return the original toast's id", () => {
	const { ctl } = setup({ dedupeWindow: 1000 });
	const first = ctl.error("Timeout");

	assert.equal(ctl.error("Timeout"), first);
	assert.equal(ctl.store.items.length, 1);
});

test("meta.duration overrides the timeout per toast; 0 is sticky", async () => {
	const { ctl } = setup({ timeout: 10 });

	ctl.push("info", "quick");
	ctl.push("info", "sticky", { duration: 0 });
	ctl.push("info", "slow", { duration: 60 });
	await wait(30);
	assert.deepEqual(ctl.store.items.map((t) => t.content), ["sticky", "slow"]);
	await wait(50);
	assert.deepEqual(ctl.store.items.map((t) => t.content), ["sticky"]);
});

test("pause keeps the remaining time; resume restarts it", async () => {
	const { ctl } = setup({ timeout: 40 });
	const id = ctl.push("info", "hover me");

	await wait(10);
	ctl.pause(id);
	await wait(50);
	assert.equal(ctl.store.items.length, 1, "a paused toast does not expire");
	ctl.resume(id);
	await wait(10);
	assert.equal(ctl.store.items.length, 1, "resumes with the time it had left, not zero");
	await wait(40);
	assert.equal(ctl.store.items.length, 0);
});

test("pause()/resume() without an id act on every toast", async () => {
	const { ctl } = setup({ timeout: 20 });

	ctl.push("info", "a");
	ctl.push("info", "b");
	ctl.pause();
	await wait(40);
	assert.equal(ctl.store.items.length, 2);
	ctl.resume();
	await wait(40);
	assert.equal(ctl.store.items.length, 0);
});

test("exitMs: dismiss marks removed, deletes later; pushing the id again revives it", async () => {
	const { ctl, root } = setup({ exitMs: 20 });
	const id = ctl.push("info", "bye", { id: "t" });

	ctl.dismiss(id);
	assert.equal(ctl.store.items[0].removed, true);
	assert.ok(root.querySelector(".qrp-toast-exit"));
	ctl.dismiss(id);   // dismissing again while exiting is a no-op

	ctl.push("info", "back", { id: "t" });
	assert.equal(ctl.store.items[0].removed, false);
	await wait(40);
	assert.equal(ctl.store.items.length, 1, "the revived toast is not deleted by the old exit timer");

	ctl.dismiss("t");
	await wait(40);
	assert.equal(ctl.store.items.length, 0);
});

test("any variant: the 'toast' bus event and extra `variants` names", () => {
	const { bus, ctl } = setup({ variants: ["loading"] });

	bus.emit("toast", { variant: "default", content: "Hi", description: "there" });
	bus.emit("loading", { message: "Saving…", id: "save" });

	assert.deepEqual(ctl.store.items.map((t) => [t.variant, t.content]), [["default", "Hi"], ["loading", "Saving…"]]);
	assert.equal(ctl.store.items[0].description, "there");
	assert.equal(ctl.store.items[1].id, "save");
});

test("dismiss deletes an item a renderer flagged removed itself (0.11 behavior)", () => {
	const t = createToasts({ timeout: 0 });
	const id = t.push("info", "hi");

	// A renderer running its own exit animation flags the item, then dismisses.
	t.store.items.find((item) => item.id === id).removed = true;
	t.dismiss(id);
	assert.equal(t.store.items.length, 0);
});

test("a repeat dismiss during qrp's own exit phase is ignored, then the item leaves", async () => {
	const t = createToasts({ timeout: 0, exitMs: 10 });
	const id = t.push("info", "hi");

	t.dismiss(id);
	t.dismiss(id);
	assert.equal(t.store.items.length, 1);
	assert.equal(t.store.items[0].removed, true);
	await new Promise((resolve) => setTimeout(resolve, 25));
	assert.equal(t.store.items.length, 0);
});

test("dedupe: a message whose toast was dismissed shows again inside the window", () => {
	const { ctl, root } = setup({ dedupeWindow: 1000 });
	const first = ctl.error("Save failed");

	ctl.dismiss(first);

	const second = ctl.error("Save failed");

	assert.notEqual(second, first, "a fresh id, not the dead one");
	assert.equal(ctl.store.items.length, 1);
	assert.equal(root.querySelectorAll(".qrp-toast-error").length, 1);
});

test("dedupe: a toast mid-exit (flagged removed) does not swallow the repeat", () => {
	const { ctl } = setup({ dedupeWindow: 1000, exitMs: 50 });
	const first = ctl.error("Save failed");

	ctl.dismiss(first);
	assert.equal(ctl.store.items[0].removed, true);

	const second = ctl.error("Save failed");

	assert.notEqual(second, first);
	assert.deepEqual(ctl.store.items.map((t) => [t.id, t.removed]), [[first, true], [second, false]]);
});

test("dedupe: past the window the same message is a new toast", async () => {
	const { ctl } = setup({ dedupeWindow: 10 });
	const first = ctl.info("a");

	ctl.info("b");
	await wait(20);

	assert.notEqual(ctl.info("a"), first);
	assert.equal(ctl.store.items.length, 3);
});

test("the stock renderer is keyed: pushing/removing keeps the other toast elements", () => {
	const { ctl, root } = setup({ exitMs: 20 });
	const first = ctl.info("first");
	const node = root.querySelector(".qrp-toast");

	ctl.info("second");
	assert.equal(root.querySelectorAll(".qrp-toast").length, 2);
	assert.equal(root.querySelector(".qrp-toast"), node, "first toast's element survives a push");

	const third = ctl.info("third");

	ctl.dismiss(first);
	assert.equal(root.querySelector(".qrp-toast"), node, "exit phase flags the same element");
	assert.ok(node.classList.contains("qrp-toast-exit"));

	const thirdNode = root.querySelectorAll(".qrp-toast")[2];

	ctl.dismiss(ctl.store.items[1].id);
	assert.equal(root.querySelectorAll(".qrp-toast")[2], thirdNode, "a sibling's exit does not rebuild the rest");
	assert.equal(ctl.store.items[2].id, third);
});

test("the stock renderer markup is unchanged", () => {
	const { ctl, root } = setup();

	ctl.success("Saved");

	const stack = root.querySelector(".qrp-toasts");

	assert.equal(stack.children.length, 1);
	assert.equal(stack.children[0].className, "qrp-toast qrp-toast-success");
	assert.equal(stack.children[0].getAttribute("role"), "status");
	assert.deepEqual([...stack.children[0].children].map((child) => child.className), ["qrp-toast-title", "qrp-toast-body", "qrp-toast-close"]);
	stack.querySelector(".qrp-toast-close").click();
	assert.equal(stack.children.length, 0);
});
