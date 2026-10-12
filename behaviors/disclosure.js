/**
 * behaviors/disclosure.js — open/close state with optional ARIA wiring.
 * Powers tabs, collapse, accordion, dropdown.
 */

import { state, effect } from "../qrp/index.js";

let panelSeq = 0;

const isBinding = (value) => Array.isArray(value) && value.length === 2 && typeof value[1] === "string";

/**
 * The `{ open }` holder for each mode. Every variant reads reactively (an
 * effect reading `.open` tracks the underlying state or thunk) and routes
 * writes to the right place.
 */
const openHolder = (initial, onChange) => {
	const notify = (value) => {
		if(onChange) {
			onChange(value);
		}
	};

	if(isBinding(initial)) {
		const [target, key] = initial;

		return {
			get open() {
				return Boolean(target[key]);
			},
			set open(value) {
				if(Boolean(target[key]) !== value) {
					target[key] = value;
					notify(value);
				}
			}
		};
	}

	if(typeof initial === "function") {
		return {
			get open() {
				return Boolean(initial());
			},
			// Driven mode: the thunk's owner decides — report, don't store.
			set open(value) {
				if(Boolean(initial()) !== value) {
					notify(value);
				}
			}
		};
	}

	const local = state({ open: Boolean(initial) });

	return {
		get open() {
			return local.open;
		},
		set open(value) {
			if(local.open !== value) {
				local.open = value;
				notify(value);
			}
		}
	};
};

/**
 * Reactive open/close state. `d.state.open` is reactive and writable in every
 * mode; connect() wires a trigger + panel (aria-expanded/aria-controls,
 * data-state, hidden, click-to-toggle).
 *
 * `initial` picks the mode:
 * - a boolean (default false) — uncontrolled, the disclosure owns the state
 * - `[state, "key"]` — two-way bound to a reactive state key
 * - a thunk `() => bool` — driven by its owner; open()/close()/toggle() only
 *   report the requested value through `onChange`
 *
 * @param {boolean|Array|Function} [initial] initial value, binding, or thunk
 * @param {object} [options]
 * @param {Function} [options.onChange] (open) => void, on every change
 * @returns {object} { state, toggle, open, close, connect }
 */
export const disclosure = (initial = false, options = {}) => {
	const self = openHolder(initial, options.onChange);

	return {
		state: self,

		toggle: () => { self.open = !self.open; },
		open: () => { self.open = true; },
		close: () => { self.open = false; },

		/**
		 * Wire a trigger button and a panel to this disclosure.
		 * @param {Element} trigger clickable toggle
		 * @param {Element} panel content shown when open
		 * @param {object} [connectOptions]
		 * @param {boolean} [connectOptions.hide] toggle `panel.hidden` (default
		 *   true); pass false to animate the panel yourself off `data-state`
		 * @param {boolean|Function} [connectOptions.disabled] ignore trigger clicks
		 *   (a thunk is read on each click)
		 */
		connect: (trigger, panel, connectOptions = {}) => {
			const hide = connectOptions.hide !== false;
			const disabled = () => {
				const value = connectOptions.disabled;

				return Boolean(typeof value === "function" ? value() : value);
			};

			if(!panel.id) {
				panelSeq += 1;
				panel.id = `qrp-disclosure-${panelSeq}`;
			}

			trigger.setAttribute("aria-controls", panel.id);

			effect(() => {
				const open = self.open;
				const dataState = open ? "open" : "closed";

				trigger.setAttribute("aria-expanded", String(open));
				trigger.setAttribute("data-state", dataState);
				panel.setAttribute("data-state", dataState);

				if(hide) {
					panel.hidden = !open;
				}
			});

			trigger.addEventListener("click", () => {
				if(!disabled()) {
					self.open = !self.open;
				}
			});
		}
	};
};
