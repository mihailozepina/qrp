/**
 * behaviors/anchored.js — position a floating element next to a trigger.
 *
 * Minimal JS positioner (fixed placement, side + alignment, flip and shift on
 * overflow) for dropdowns, tooltips, popovers, submenus. If you target modern
 * browsers, the native Popover API + CSS anchor positioning can replace this —
 * it's here for portability.
 */

import { onDispose } from "../qrp/index.js";

const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" };

const isVertical = (side) => side === "top" || side === "bottom";

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

// Room between the reference and the viewport edge on a side.
const spaceOn = (side, ref, view) => ({
	top: ref.top,
	bottom: view.height - ref.bottom,
	left: ref.left,
	right: view.width - ref.right
})[side];

// Main-axis coordinate (top for top/bottom, left for left/right).
const mainAxis = (side, ref, size, offset) => ({
	top: ref.top - size.height - offset,
	bottom: ref.bottom + offset,
	left: ref.left - size.width - offset,
	right: ref.right + offset
})[side];

// Cross-axis coordinate for an alignment.
const crossAxis = (side, align, ref, size, offset) => {
	const start = isVertical(side) ? ref.left : ref.top;
	const length = isVertical(side) ? ref.width : ref.height;
	const own = isVertical(side) ? size.width : size.height;

	if(align === "end") {
		return start + length - own - offset;
	}

	if(align === "center") {
		return start + (length - own) / 2 + offset;
	}

	return start + offset;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

// Where a zoom animation should grow from: the edge touching the reference.
const transformOrigin = (side, align) => {
	const edge = OPPOSITE[side];
	const cross = {
		start: isVertical(side) ? "left" : "top",
		center: "center",
		end: isVertical(side) ? "right" : "bottom"
	}[align];

	return isVertical(side) ? `${cross} ${edge}` : `${edge} ${cross}`;
};

/**
 * The preferred side, unless it doesn't fit and the opposite side does — or
 * neither fits and the opposite has more room.
 */
const chooseSide = (preferred, ref, size, offset, padding, view) => {
	const needed = (isVertical(preferred) ? size.height : size.width) + offset + padding;
	const opposite = OPPOSITE[preferred];
	const here = spaceOn(preferred, ref, view);
	const there = spaceOn(opposite, ref, view);

	if(here >= needed) {
		return preferred;
	}

	return there >= needed || there > here ? opposite : preferred;
};

/**
 * A virtual reference at a viewport point — anchor a context menu at the cursor:
 * `anchored(pointAt(event.clientX, event.clientY), menu)`.
 *
 * @param {number} x clientX
 * @param {number} y clientY
 * @returns {{ getBoundingClientRect: Function }}
 */
export const pointAt = (x, y) => ({
	getBoundingClientRect: () => ({ top: y, bottom: y, left: x, right: x, width: 0, height: 0, x, y })
});

/**
 * Position `floating` relative to `trigger` and keep it there on scroll/resize
 * (and when the floating element itself resizes). The teardown also registers
 * with the current scope (`scope`/`scoped`/`mount`), so disposing the owner
 * detaches the listeners — no need to track the undo by hand. The returned undo
 * is idempotent (safe to also call manually).
 *
 * Writes `data-side` / `data-align` on the floating element (the side actually
 * used, after flipping) and CSS variables for styling: `--qrp-transform-origin`,
 * `--qrp-anchor-width`, `--qrp-anchor-height`, `--qrp-available-width`,
 * `--qrp-available-height`.
 *
 * @param {Element|{getBoundingClientRect: Function}} trigger the anchor, or a
 *   virtual reference such as pointAt(x, y)
 * @param {Element} floating the element to position
 * @param {object} [options]
 * @param {("top"|"right"|"bottom"|"left")} [options.side] preferred side (default bottom)
 * @param {("top"|"bottom")} [options.placement] alias of `side` (older name)
 * @param {("start"|"center"|"end")} [options.align] cross-axis alignment (default start)
 * @param {number} [options.sideOffset] px gap from the trigger (default 4)
 * @param {number} [options.gap] alias of `sideOffset` (older name)
 * @param {number} [options.alignOffset] cross-axis nudge in px (default 0)
 * @param {number} [options.collisionPadding] px kept clear of the viewport edge (default 0)
 * @param {boolean} [options.avoidCollisions] flip to the opposite side and shift
 *   along the cross axis to stay on screen (default true)
 * @param {boolean} [options.matchWidth] size floating to the trigger's width
 *   (the common dropdown-spans-its-input case)
 * @returns {Function} dispose (also exposes .update() to reposition manually)
 */
export const anchored = (trigger, floating, options = {}) => {
	const preferred = options.side || options.placement || "bottom";
	const align = options.align || "start";
	const offset = [options.sideOffset, options.gap, 4].find((value) => value !== undefined);
	const alignOffset = options.alignOffset || 0;
	const padding = options.collisionPadding || 0;
	const avoid = options.avoidCollisions !== false;

	const update = () => {
		const ref = trigger.getBoundingClientRect();
		const view = viewport();

		floating.style.position = "fixed";
		floating.style.setProperty("--qrp-anchor-width", `${ref.width}px`);
		floating.style.setProperty("--qrp-anchor-height", `${ref.height}px`);

		if(options.matchWidth) {
			floating.style.minWidth = ref.width + "px";
		}

		const rect = floating.getBoundingClientRect();
		const size = { width: rect.width, height: rect.height };
		const side = avoid ? chooseSide(preferred, ref, size, offset, padding, view) : preferred;
		const main = mainAxis(side, ref, size, offset);
		const crossRaw = crossAxis(side, align, ref, size, alignOffset);

		// Shift along the cross axis only, so the gap to the trigger is kept.
		const cross = avoid
			? clamp(crossRaw, padding, (isVertical(side) ? view.width - size.width : view.height - size.height) - padding)
			: crossRaw;

		const top = isVertical(side) ? main : cross;
		const left = isVertical(side) ? cross : main;
		const available = Math.max(0, spaceOn(side, ref, view) - offset - padding);

		floating.style.top = Math.round(top) + "px";
		floating.style.left = Math.round(left) + "px";
		floating.style.setProperty("--qrp-available-height", `${Math.round(isVertical(side) ? available : view.height - 2 * padding)}px`);
		floating.style.setProperty("--qrp-available-width", `${Math.round(isVertical(side) ? view.width - 2 * padding : available)}px`);
		floating.style.setProperty("--qrp-transform-origin", transformOrigin(side, align));
		floating.setAttribute("data-side", side);
		floating.setAttribute("data-align", align);
	};

	update();

	window.addEventListener("resize", update);
	window.addEventListener("scroll", update, true);

	// Content that grows after opening (async rows, a filter narrowing a list)
	// must re-place itself, or it overflows the edge it was flipped away from.
	const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);

	if(observer) {
		observer.observe(floating);
	}

	let done = false;
	const dispose = () => {
		if(done) {
			return;
		}

		done = true;
		window.removeEventListener("resize", update);
		window.removeEventListener("scroll", update, true);

		if(observer) {
			observer.disconnect();
		}
	};

	dispose.update = update;

	onDispose(dispose);

	return dispose;
};
