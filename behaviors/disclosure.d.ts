export interface DisclosureConnectOptions {
	/** Toggle `panel.hidden` (default true). Pass false to animate the panel
	 *  yourself off its `data-state` ("open" | "closed"). */
	hide?: boolean;
	/** Ignore trigger clicks while true; a thunk is read on each click. */
	disabled?: boolean | (() => boolean);
}
export interface DisclosureOptions {
	/** Called with the new (or, in driven mode, requested) open value on every change. */
	onChange?: (open: boolean) => void;
}
export interface Disclosure {
	/** Reactive and writable in every mode. */
	state: { open: boolean };
	toggle(): void;
	open(): void;
	close(): void;
	/** Wire trigger + panel: aria-expanded, aria-controls (assigns panel.id if
	 *  missing), data-state on both, `hidden` (unless `hide: false`), click toggles. */
	connect(trigger: Element, panel: HTMLElement, options?: DisclosureConnectOptions): void;
}
/**
 * Reactive open/close state with optional ARIA wiring. `initial` is a boolean
 * (uncontrolled), a `[state, "key"]` tuple (two-way bound), or a thunk (driven:
 * open/close/toggle only report through `onChange`).
 * @example
 * const d = disclosure([ui, "filtersOpen"]);   // bound to reactive state
 * d.connect(button, panel, { hide: false });    // animate off data-state
 */
export function disclosure(
	initial?: boolean | [Record<string, any>, string] | (() => boolean),
	options?: DisclosureOptions
): Disclosure;
