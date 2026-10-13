/**
 * behaviors/trap-focus.js — keep Tab focus inside a node, restore it on close.
 * The a11y-critical part of a modal/dialog.
 */

import { onDispose } from "../qrp/index.js";

const FOCUSABLE = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex=\"-1\"])"
].join(",");

// The selector also matches elements Tab never lands on. If one of those comes
// last (or first), the wrap check below never matches and focus escapes the
// trap, so drop them: negative tabindex, anything under [hidden]/[inert], and
// (where the browser supports it) anything not rendered (display:none etc.).
const isTabbable = (element) => {
	const tabindex = element.getAttribute("tabindex");

	if(tabindex !== null && parseInt(tabindex, 10) < 0) {
		return false;
	}

	if(element.closest("[hidden],[inert]")) {
		return false;
	}

	return typeof element.checkVisibility === "function" ? element.checkVisibility() : true;
};

/**
 * Trap Tab/Shift+Tab within `node`, focus its first focusable (or the node),
 * and restore focus to the previously-focused element on dispose. The teardown
 * also registers with the current scope (`scope`/`scoped`/`mount`), so disposing
 * the owner restores focus — no need to track the undo by hand. The returned
 * undo is idempotent (safe to also call manually).
 *
 * @param {Element} node container to trap focus within
 * @returns {Function} dispose
 */
export const trapFocus = (node) => {
	const previouslyFocused = document.activeElement;

	const focusables = () => [...node.querySelectorAll(FOCUSABLE)].filter(isTabbable);

	const onKey = (event) => {
		if(event.key !== "Tab") {
			return;
		}

		const items = focusables();

		if(items.length === 0) {
			event.preventDefault();

			return;
		}

		const first = items[0];
		const last = items[items.length - 1];

		if(event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if(!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};

	node.addEventListener("keydown", onKey);

	const initial = focusables()[0] || node;

	if(initial.focus) {
		initial.focus();
	}

	let done = false;
	const undo = () => {
		if(done) {
			return;
		}

		done = true;
		node.removeEventListener("keydown", onKey);

		if(previouslyFocused && previouslyFocused.focus) {
			previouslyFocused.focus();
		}
	};

	onDispose(undo);

	return undo;
};
