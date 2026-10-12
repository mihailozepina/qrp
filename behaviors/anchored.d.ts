export type Side = "top" | "right" | "bottom" | "left";
export type Align = "start" | "center" | "end";
export interface AnchoredOptions {
	/** Preferred side (default "bottom"); flips when it doesn't fit. */
	side?: Side;
	/** Alias of `side` (the older name). */
	placement?: Side;
	/** Cross-axis alignment (default "start" — left edges line up). */
	align?: Align;
	/** Gap from the trigger in px (default 4). */
	sideOffset?: number;
	/** Alias of `sideOffset` (the older name). */
	gap?: number;
	/** Cross-axis nudge in px (default 0). */
	alignOffset?: number;
	/** px kept clear of the viewport edge when flipping/shifting (default 0). */
	collisionPadding?: number;
	/** Flip to the opposite side and shift along the cross axis to stay on screen (default true). */
	avoidCollisions?: boolean;
	/** Size the floating element to the trigger's width (dropdown-spans-input). */
	matchWidth?: boolean;
}
/** Anything with a bounding rect — an Element or a virtual point. */
export interface AnchorReference { getBoundingClientRect(): DOMRect | { top: number; bottom: number; left: number; right: number; width: number; height: number }; }
export interface AnchoredDispose { (): void; update(): void; }
/**
 * Position `floating` next to `trigger`; returns an idempotent dispose() (with
 * .update()). Also auto-registers teardown with the current scope.
 *
 * Writes `data-side` / `data-align` (the side actually used after flipping) and
 * the CSS variables `--qrp-transform-origin`, `--qrp-anchor-width`,
 * `--qrp-anchor-height`, `--qrp-available-width`, `--qrp-available-height`.
 * @example
 * anchored(button, menu, { side: "right", align: "start", sideOffset: 8 });
 * anchored(pointAt(event.clientX, event.clientY), contextMenu);
 */
export function anchored(trigger: Element | AnchorReference, floating: HTMLElement, options?: AnchoredOptions): AnchoredDispose;
/** A virtual reference at a viewport point (anchor a context menu at the cursor). */
export function pointAt(x: number, y: number): AnchorReference;
