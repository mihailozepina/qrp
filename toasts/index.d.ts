/**
 * @module toasts
 * Notifications driven by the global bus — any code raises one without importing
 * the UI. `notify.success|error|info|warning(content)` where content is any
 * renderable; `bus.emit("toast", { variant, content, … })` for any other variant.
 * Mount the singleton once: `mount(document.body, toasts.component)`.
 *
 * `push` returns the toast id; `update(id, patch)`, `pause`/`resume` and
 * `dismiss(id)` act on it, `meta.duration` sets a per-toast timeout, extra meta
 * fields (description, action, …) stay on the item, and `exitMs` keeps a
 * dismissed toast (`removed: true`) around for an exit animation — enough for a
 * custom renderer to be a plain view over `store.items`.
 * @example
 * const id = toasts.push("loading", "Saving…", { duration: 0 });
 * save().then(() => toasts.update(id, { variant: "success", content: "Saved", duration: 3000 }));
 */
import type { Renderable } from "../qrp/index.js";
import type { Emitter } from "../events/index.js";

export type Variant = "success" | "error" | "info" | "warning";

export interface ToastMeta {
	title?: string;
	/** Reuse this id: a live toast with it is updated instead of a new one added. */
	id?: ToastId;
	/** Per-toast auto-dismiss delay in ms (0 or Infinity = sticky). Default: the controller's timeout. */
	duration?: number;
	/** Any other field (description, action, icon, …) is kept on the item. */
	[key: string]: any;
}

export type ToastId = number | string;

/**
 * An object payload for a bus toast event / notify: the content is taken from
 * `content`, else `message`, else `body`; every other field (title, id,
 * duration, description, …) becomes the toast's meta.
 */
export interface ToastPayload extends ToastMeta {
	content?: Renderable;
	message?: Renderable;
	body?: Renderable;
}

/** A toast in `store.items`. Reactive: `update()` changes show up in renderers. */
export interface ToastItem {
	id: ToastId;
	variant: string;
	title: string;
	content: Renderable;
	/** true while a dismissed toast plays its exit (see `exitMs`). */
	removed: boolean;
	[key: string]: any;
}

export interface ToastsOptions {
	bus?: Emitter;
	/** Auto-dismiss delay in ms (0 = sticky). */
	timeout?: number;
	/** Identical-message suppression window in ms (only while the earlier toast is still showing). */
	dedupeWindow?: number;
	/** Keep a dismissed toast (marked `removed`) this long before deleting it (default 0). */
	exitMs?: number;
	/** Extra bus event names to treat as variants (e.g. ["loading"]). */
	variants?: string[];
}

export interface ToastsController {
	/** Mount this once near the root: mount(document.body, toasts.component). */
	component: (view: HTMLElement) => void;
	store: { items: ToastItem[] };
	/** Add a toast (or update the live one with `meta.id`); returns its id. */
	push(variant: Variant | string, content: Renderable, meta?: ToastMeta): ToastId;
	/** Merge fields into a toast; a `duration` restarts its countdown. False if gone. */
	update(id: ToastId, patch: Partial<ToastItem> & { duration?: number }): boolean;
	dismiss(id: ToastId): void;
	/** Stop the countdown, keeping the time left (one toast, or all). */
	pause(id?: ToastId): void;
	/** Restart a paused countdown (one toast, or all). */
	resume(id?: ToastId): void;
	success(content: Renderable, meta?: ToastMeta): ToastId;
	error(content: Renderable, meta?: ToastMeta): ToastId;
	info(content: Renderable, meta?: ToastMeta): ToastId;
	warning(content: Renderable, meta?: ToastMeta): ToastId;
}

/** Create a toast controller wired to an emitter. */
export function createToasts(options?: ToastsOptions): ToastsController;

/** The default toast controller wired to the global bus. */
export const toasts: ToastsController;

/** Fire-and-forget notifications through the global bus. Content is a
 *  renderable, or a `{ message | content | body, title, … }` payload. */
export const notify: {
	success(content: Renderable | ToastPayload): void;
	error(content: Renderable | ToastPayload): void;
	info(content: Renderable | ToastPayload): void;
	warning(content: Renderable | ToastPayload): void;
};
