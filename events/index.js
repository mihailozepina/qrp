/**
 * events/index.js — a global event bus for propagating changes everywhere.
 *
 * Built on the platform's own EventTarget/CustomEvent (native is better),
 * wrapped in a plain-object API — no classes. Two things:
 *
 *   bus            a ready-made global emitter (singleton)
 *   emitter()      make your own scoped emitter
 *
 * Plus bridges between events and qrp reactivity:
 *
 *   fromEvent(...)  turn an event stream into reactive state
 *   channel(name)   a cross-tab bus over BroadcastChannel
 *
 * The API deliberately mirrors the tracker syncer: on/off/once/emit, and a
 * request()/respond() pair for promise-based request→response over the bus.
 */

import { state, effect, onDispose } from "../qrp/index.js";

/**
 * Create an emitter backed by an EventTarget.
 *   const e = emitter();
 *   const off = e.on("thing", payload => ...);
 *   e.emit("thing", { any: "payload" });
 *   off();                 // unsubscribe
 *   await e.once("ready");  // promise for the next event
 */
export const emitter = () => {
	const target = new EventTarget();

	// Map wrapped listeners back to originals so off() works with the same fn.
	// handler -> Map(type -> Set(wrapped)). Keyed by BOTH so the same handler
	// can be subscribed to several types, and a Set per type so subscribing it
	// to the same type twice keeps both wrappers — each on()'s unsubscribe
	// removes exactly its own registration.
	const wrappers = new WeakMap();

	const removeWrapper = (type, handler, wrapped) => {
		const byType = wrappers.get(handler);
		const set = byType && byType.get(type);

		if(!set || !set.delete(wrapped)) {
			return;
		}

		target.removeEventListener(type, wrapped);

		if(set.size === 0) {
			byType.delete(type);
		}
	};

	const self = {
		target,

		on: (type, handler) => {
			const wrapped = (event) => handler(event.detail, event);

			let byType = wrappers.get(handler);

			if(!byType) {
				byType = new Map();
				wrappers.set(handler, byType);
			}

			if(!byType.has(type)) {
				byType.set(type, new Set());
			}

			byType.get(type).add(wrapped);
			target.addEventListener(type, wrapped);

			return () => removeWrapper(type, handler, wrapped);
		},

		/** Remove every subscription of `handler` to `type`. */
		off: (type, handler) => {
			const byType = wrappers.get(handler);
			const set = byType && byType.get(type);

			if(set) {
				[...set].forEach(wrapped => removeWrapper(type, handler, wrapped));
			}
		},

		once: (type) => new Promise(resolve => {
			target.addEventListener(type, (event) => resolve(event.detail), { once: true });
		}),

		emit: (type, detail) => {
			target.dispatchEvent(new CustomEvent(type, { detail }));

			return self;
		},

		/**
		 * Fire a request and await a matching response. A responder replies
		 * with respond(). Mirrors the syncer's sendCommand/id correlation.
		 */
		request: (type, payload, { timeout = 3000 } = {}) => {
			const id = `${type}:${requestCounter++}`;

			return new Promise((resolve, reject) => {
				const timer = setTimeout(() => {
					self.off(`response:${id}`, onResponse);
					reject(new Error(`qrp bus: request "${type}" timed out`));
				}, timeout);

				const onResponse = (detail) => {
					clearTimeout(timer);
					self.off(`response:${id}`, onResponse);

					if(detail && detail.error) {
						reject(detail.error);
					} else {
						resolve(detail && detail.result);
					}
				};

				self.on(`response:${id}`, onResponse);
				self.emit(type, { id, payload });
			});
		},

		/** Register a handler that answers request()s of a given type. */
		respond: (type, handler) => {
			return self.on(type, async ({ id, payload }) => {
				try {
					self.emit(`response:${id}`, { result: await handler(payload) });
				} catch(error) {
					self.emit(`response:${id}`, { error });
				}
			});
		}
	};

	return self;
};

let requestCounter = 0;

/** The global bus. Import it anywhere; everyone shares one channel. */
export const bus = emitter();

/**
 * Turn an event source into reactive state: { value } holding the latest
 * detail (via map). Works with the qrp bus, a raw EventTarget, or any object
 * exposing addEventListener. The listener is removed when the enclosing
 * scope (or effect) is disposed, so a component's fromEvent doesn't leak.
 *
 *   const last = fromEvent(bus, "user:login", u => u.name);
 *   effect(() => console.log("logged in:", last.value));
 */
export const fromEvent = (source, type, map = (detail) => detail, initial = undefined) => {
	const store = state({ value: initial });

	const handler = (detail) => { store.value = map(detail); };

	if(typeof source.on === "function") {
		const off = source.on(type, handler);

		onDispose(() => {
			if(typeof off === "function") {
				off();
			} else if(typeof source.off === "function") {
				source.off(type, handler);
			}
		});
	} else {
		const listener = (event) => handler(event.detail ?? event);

		source.addEventListener(type, listener);
		onDispose(() => source.removeEventListener(type, listener));
	}

	return store;
};

/**
 * A cross-tab bus over BroadcastChannel: emit in one tab, receive in all.
 * Same on/emit surface as emitter(). Falls back to a local emitter where
 * BroadcastChannel is unavailable (with a no-op close()).
 */
export const channel = (name) => {
	if(typeof BroadcastChannel === "undefined") {
		const fallback = emitter();

		const local = {
			on: fallback.on,
			off: fallback.off,
			once: fallback.once,

			emit: (type, detail) => {
				fallback.emit(type, detail);
				return local;
			},

			close: () => {}
		};

		return local;
	}

	const bc = new BroadcastChannel(name);
	const local = emitter();

	bc.onmessage = (event) => {
		const { type, detail } = event.data || {};

		local.emit(type, detail);
	};

	const self = {
		on: local.on,
		off: local.off,
		once: local.once,

		emit: (type, detail) => {
			bc.postMessage({ type, detail });
			local.emit(type, detail); // also deliver to this tab
			return self;
		},

		close: () => bc.close()
	};

	return self;
};

/**
 * Mirror a piece of reactive state onto the bus: every change emits `type`
 * with the current value. Wire two stores to the same type across tabs (via
 * channel) and you have distributed state in a few lines.
 */
export const broadcast = (emitterLike, type, store, key = "value") => {
	return effect(() => {
		emitterLike.emit(type, store[key]);
	});
};
