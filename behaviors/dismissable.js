/**
 * behaviors/dismissable.js — close-on-Escape and close-on-outside-click, aware
 * of nesting.
 *
 * Every live dismissable is a LAYER on one shared stack (newest on top), so
 * nested floating UI behaves — a popover opened from a dialog, a submenu from a
 * menu, a select inside a sheet:
 *
 * - Escape dismisses only the topmost layer that listens for Escape.
 * - An outside pointerdown walks the stack from the top, dismissing each layer
 *   the pointer is outside of, and stops at the layer it landed in. A click in
 *   the popover closes nothing; a click in the dialog closes just the popover.
 * - A `modal` layer stops the walk: what's under a modal isn't clickable, so it
 *   isn't dismissed by a click either.
 */

import { onDispose } from "../qrp/index.js";

const stack = [];

const contains = (layer, target) => layer.inside.some((node) => node && node.contains(target));

const onKey = (event) => {
	if(event.key !== "Escape") {
		return;
	}

	const top = stack.slice().reverse().find((layer) => layer.escape);

	if(top) {
		top.onDismiss(event);
	}
};

const onPointer = (event) => {
	// A copy: a dismissed layer usually disposes itself (splicing the stack).
	stack.slice().reverse().every((layer) => {
		if(contains(layer, event.target)) {
			return false;
		}

		if(layer.armed && layer.outside) {
			layer.onDismiss(event);
		}

		return !layer.modal;
	});
};

// One pair of document listeners serves every layer; only while any is open.
const listen = (on) => {
	const method = on ? "addEventListener" : "removeEventListener";

	document[method]("keydown", onKey, true);
	document[method]("pointerdown", onPointer, true);
};

/**
 * Call `onDismiss` when the user presses Escape or clicks outside `node`.
 * Guarantee: a layer only reacts to outside clicks from the next tick on, so
 * the same interaction that opened the element (a "…" menu click, an "edit"
 * button spawning an inline editor) never counts as an outside click and
 * self-dismisses it — no stopPropagation needed at the opener.
 * The teardown also registers with the current scope (`scope`/`scoped`/`mount`),
 * so disposing the owner removes the layer — no need to track the undo by hand.
 * The returned undo is idempotent (safe to also call manually).
 *
 * @param {Node} node the element considered "inside"
 * @param {Function} onDismiss called with the triggering event
 * @param {object} [options]
 * @param {boolean} [options.escape] listen for Escape (default true)
 * @param {boolean} [options.outside] listen for outside pointerdown (default true)
 * @param {Node[]} [options.inside] more nodes that count as inside — typically
 *   the trigger, so clicking it toggles instead of dismiss-then-reopen
 * @param {boolean} [options.modal] outside clicks don't reach layers below this one
 * @returns {Function} dispose
 */
export const dismissable = (node, onDismiss, options = {}) => {
	const layer = {
		inside: [node].concat(options.inside || []),
		escape: options.escape !== false,
		outside: options.outside !== false,
		modal: Boolean(options.modal),
		armed: false,
		onDismiss
	};

	if(stack.length === 0) {
		listen(true);
	}

	stack.push(layer);

	// Defer so the opening click isn't caught as an outside click.
	const timer = setTimeout(() => { layer.armed = true; }, 0);

	let done = false;
	const undo = () => {
		if(done) {
			return;
		}

		done = true;
		clearTimeout(timer);

		const index = stack.indexOf(layer);

		if(index !== -1) {
			stack.splice(index, 1);
		}

		if(stack.length === 0) {
			listen(false);
		}
	};

	onDispose(undo);

	return undo;
};
