export interface DismissableOptions {
	/** Listen for Escape (default true). */
	escape?: boolean;
	/** Listen for outside pointerdown (default true). */
	outside?: boolean;
	/** More nodes that count as inside — typically the trigger, so clicking it
	 *  toggles instead of dismiss-then-reopen. */
	inside?: Node[];
	/** Outside clicks don't reach (dismiss) layers below this one. */
	modal?: boolean;
}
/**
 * Call onDismiss on Escape or outside pointerdown; returns an idempotent
 * dispose(). Also auto-registers teardown with the current scope.
 *
 * **Nesting-aware:** live dismissables form one stack (newest on top). Escape
 * dismisses only the topmost layer listening for it; an outside pointerdown
 * dismisses layers from the top down and stops at the layer it landed in — a
 * click inside a popover opened from a dialog closes neither, a click in the
 * dialog closes just the popover. A `modal` layer stops the walk.
 *
 * **Guarantee:** a layer only reacts to outside clicks from the *next tick* on,
 * so the same interaction that opened the element (the click on a "…" menu, an
 * "edit" button spawning an inline editor) never counts as an outside click and
 * self-dismisses it. Rely on this — no `stopPropagation` needed at the opener.
 */
export function dismissable(node: Node, onDismiss: (event: Event) => void, options?: DismissableOptions): () => void;
