/**
 * toasts/index.js — notifications driven by the global event pipe.
 *
 * Any code, anywhere, raises a notification by emitting on the bus — it never
 * needs to know the toast UI exists:
 *
 *   import { notify } from "./toasts/index.js";
 *   notify.success("Settings saved");
 *   notify.error("Could not reach the hotspot");
 *
 *   // ...or emit on the bus directly (e.g. from a service layer):
 *   bus.emit("error", { message: "Timeout" });
 *
 * Mount the stack once, near the root:
 *
 *   import { toasts } from "./toasts/index.js";
 *   mount(document.body, toasts.component);
 *
 * A toast's content is a RENDERABLE — a string, a DOM node, an array, or a
 * thunk () => renderable (anything el() accepts as a child) — so a toast can
 * carry a link, a button, an icon, whatever:
 *
 *   notify.error(el("span", {}, "Save failed — ",
 *       el("a", { href: "/logs" }, "see logs")));
 *
 * NOTE: a DOM node lives in exactly one place in the tree — inserting it
 * elsewhere MOVES it. If you want the same content in more than one toast, pass
 * a thunk (() => el(...)) so each toast builds its own node, rather than sharing
 * one live node between them.
 *
 * Repeated identical (string) messages inside DEDUPE_WINDOW are collapsed (so a
 * retry storm doesn't bury the screen), and each toast auto-dismisses after
 * TIMEOUT (per toast: `meta.duration`). `push` returns the toast's id, and
 * `update` / `pause` / `resume` / `dismiss` take it — enough for a richer
 * renderer (a sonner-style stack) to be just a view over `store.items`.
 */

import { state, el } from "../qrp/index.js";
import { bus } from "../events/index.js";

// --- configuration ----------------------------------------------------------

const TIMEOUT = 4000;          // ms before a toast auto-dismisses (0 = sticky)
const DEDUPE_WINDOW = 1000;    // ms within which an identical message is dropped

const VARIANTS = {
	success: "Success",
	error: "Error",
	info: "Info",
	warning: "Warning"
};

// --- factory ----------------------------------------------------------------

// Meta keys the controller owns; every other meta field is kept on the item
// (description, action, icon, …) for renderers to read.
const OWN_META = ["id", "duration"];

/**
 * Create a toast controller wired to an event emitter.
 *
 * @param {object} [options]
 * @param {object} [options.bus] emitter to listen on (default: the global bus)
 * @param {number} [options.timeout] default auto-dismiss delay in ms (0 = sticky)
 * @param {number} [options.dedupeWindow] identical-message suppression window
 * @param {number} [options.exitMs] keep a dismissed toast (marked `removed`) this
 *   long before deleting it, so a renderer can play an exit animation (default 0)
 * @param {string[]} [options.variants] extra bus event names to listen on as
 *   variants (e.g. ["loading"]); any variant also arrives via the "toast" event
 * @returns {object} { component, store, push, update, dismiss, pause, resume, success, error, info, warning }
 */
export const createToasts = (options = {}) => {
	const emitter = options.bus || bus;
	const timeout = options.timeout === undefined ? TIMEOUT : options.timeout;
	const dedupeWindow = options.dedupeWindow === undefined ? DEDUPE_WINDOW : options.dedupeWindow;
	const exitMs = options.exitMs || 0;

	const store = state({ items: [] });

	// message key -> { at, id } of the last one shown, for deduping bursts.
	const lastSeen = {};

	// id -> { remaining, started, handle } — one countdown per toast.
	const timers = new Map();

	// id -> pending removal of a dismissed toast (its exit phase).
	const exits = new Map();

	let seq = 0;

	const find = (id) => store.items.find((toast) => toast.id === id);

	const stopTimer = (id) => {
		const timer = timers.get(id);

		if(timer && timer.handle) {
			clearTimeout(timer.handle);
			timer.handle = null;
		}
	};

	const remove = (id) => {
		stopTimer(id);
		timers.delete(id);
		exits.delete(id);
		store.items = store.items.filter((toast) => toast.id !== id);
	};

	/**
	 * Dismiss a toast. With `exitMs` the item is first marked `removed: true`
	 * (play the exit animation on that) and deleted once `exitMs` has passed.
	 * @param {*} id toast id
	 */
	const dismiss = (id) => {
		const toast = find(id);

		// Ignore a repeat dismiss only while OUR exit timer runs. An item flagged
		// `removed` by someone else (a renderer running its own exit animation,
		// as 0.11 code did) must still be deleted when it calls dismiss().
		if(!toast || exits.has(id)) {
			return;
		}

		stopTimer(id);

		if(exitMs > 0) {
			toast.removed = true;
			exits.set(id, setTimeout(() => remove(id), exitMs));
		} else {
			remove(id);
		}
	};

	const startTimer = (id, ms) => {
		stopTimer(id);

		if(!(ms > 0) || ms === Infinity) {
			timers.delete(id);
			return;
		}

		timers.set(id, { remaining: ms, started: Date.now(), handle: setTimeout(() => dismiss(id), ms) });
	};

	/**
	 * Stop a toast's countdown, keeping the time it has left (hover, hidden tab).
	 * @param {*} [id] toast id; omitted = every toast
	 */
	const pause = (id) => {
		const ids = id === undefined ? [...timers.keys()] : [id];

		ids.forEach((key) => {
			const timer = timers.get(key);

			if(timer && timer.handle) {
				clearTimeout(timer.handle);
				timer.handle = null;
				timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.started));
			}
		});
	};

	/**
	 * Restart a paused countdown with the time it had left.
	 * @param {*} [id] toast id; omitted = every toast
	 */
	const resume = (id) => {
		const ids = id === undefined ? [...timers.keys()] : [id];

		ids.forEach((key) => {
			const timer = timers.get(key);

			if(timer && !timer.handle) {
				timer.started = Date.now();
				timer.handle = setTimeout(() => dismiss(key), timer.remaining);
			}
		});
	};

	const extraOf = (meta) => Object.keys(meta)
		.filter((key) => !OWN_META.includes(key) && meta[key] !== undefined)
		.reduce((acc, key) => {
			acc[key] = meta[key];
			return acc;
		}, {});

	/**
	 * Merge a patch into a toast (content, variant, title, description, …). A
	 * `duration` in the patch restarts its countdown.
	 * @param {*} id toast id
	 * @param {object} patch fields to merge
	 * @returns {boolean} false when no such toast
	 */
	const update = (id, patch = {}) => {
		const toast = find(id);

		if(!toast) {
			return false;
		}

		// A title that was just the variant's default follows a variant change.
		const defaultTitle = toast.title === (VARIANTS[toast.variant] || toast.variant);

		Object.assign(toast, extraOf(patch));

		if(patch.variant && patch.title === undefined && defaultTitle) {
			toast.title = VARIANTS[patch.variant] || patch.variant;
		}

		if(patch.duration !== undefined) {
			startTimer(id, patch.duration);
		}

		return true;
	};

	/**
	 * Add a toast — or, with `meta.id` naming a live toast, update that one.
	 * @param {string} variant success | error | info | warning, or any string
	 * @param {(string|Node|Array|function)} content a renderable (el child)
	 * @param {object} [meta] { title, id, duration, …any fields renderers read }
	 * @returns {*} the toast's id
	 */
	const push = (variant, content, meta = {}) => {
		const duration = meta.duration === undefined ? timeout : meta.duration;

		if(meta.id !== undefined && find(meta.id)) {
			// Pushing to a toast that is mid-exit revives it.
			clearTimeout(exits.get(meta.id));
			exits.delete(meta.id);
			update(meta.id, Object.assign({}, meta, { variant, content, removed: false, duration }));

			return meta.id;
		}

		// Dedupe only makes sense for plain string content without an explicit id.
		if(typeof content === "string" && meta.id === undefined) {
			const now = Date.now();
			const key = variant + ":" + content;
			const last = lastSeen[key];

			if(last && now - last.at < dedupeWindow) {
				return last.id;
			}

			lastSeen[key] = { at: now, id: seq + 1 };
		}

		const id = meta.id === undefined ? ++seq : meta.id;

		store.items = [...store.items, Object.assign(extraOf(meta), {
			id,
			variant,
			title: meta.title || VARIANTS[variant] || variant,
			content,
			removed: false
		})];

		startTimer(id, duration);

		return id;
	};

	// --- wire the global event pipe -----------------------------------------
	// Payload may be a bare renderable, or { content | message | body, title, … }.
	const isRecord = (payload) => payload && typeof payload === "object" && !(payload instanceof Node) && !Array.isArray(payload);

	const contentOf = (payload) => {
		if(isRecord(payload)) {
			return payload.content || payload.message || payload.body || String(payload);
		}

		return payload;
	};

	// Extra fields of an object payload (title, description, id, duration, …).
	const metaOf = (payload) => {
		if(!isRecord(payload)) {
			return {};
		}

		const meta = Object.assign({}, payload);

		["content", "message", "body", "variant"].forEach((key) => { delete meta[key]; });

		return meta;
	};

	Object.keys(VARIANTS).concat(options.variants || []).forEach((variant) => {
		emitter.on(variant, (payload) => push(variant, contentOf(payload), metaOf(payload)));
	});

	// Any variant: bus.emit("toast", { variant: "loading", content: "Saving…" }).
	emitter.on("toast", (payload) => push(isRecord(payload) && payload.variant ? payload.variant : "info", contentOf(payload), metaOf(payload)));

	// --- the mountable component --------------------------------------------
	const component = (view) => {
		view.appendChild(el("div", { class: "qrp-toasts" }, () => {
			return store.items.map((toast) => {
				return el("div", {
					class: () => `qrp-toast qrp-toast-${toast.variant}${toast.removed ? " qrp-toast-exit" : ""}`,
					role: "status",
					onpointerenter: () => pause(toast.id),
					onpointerleave: () => resume(toast.id)
				},
				el("strong", { class: "qrp-toast-title" }, () => toast.title),
				// A thunk content is called here, so each toast builds its own nodes.
				el("span", { class: "qrp-toast-body" }, () => (typeof toast.content === "function" ? toast.content() : toast.content)),
				el("button", { class: "qrp-toast-close", onclick: () => dismiss(toast.id) }, "✕")
				);
			});
		}));
	};

	// Direct helpers, one per variant (push without going through the bus).
	const helpers = {};

	Object.keys(VARIANTS).forEach((variant) => {
		helpers[variant] = (content, meta) => push(variant, content, meta);
	});

	return { component, store, push, update, dismiss, pause, resume, ...helpers };
};

// --- default singleton wired to the global bus ------------------------------

export const toasts = createToasts();

/**
 * Fire-and-forget notifications through the global bus, so any module can raise
 * one without importing the toast UI at all. `content` is a renderable.
 */
export const notify = {
	success: (content) => bus.emit("success", content),
	error: (content) => bus.emit("error", content),
	info: (content) => bus.emit("info", content),
	warning: (content) => bus.emit("warning", content)
};
