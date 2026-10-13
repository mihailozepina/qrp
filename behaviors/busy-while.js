/**
 * behaviors/busy-while.js — a reactive busy flag around in-flight promises.
 * Drives spinners / overlays / skeletons for arbitrary async work (the
 * generic cousin of http.loading).
 */

import { state, untracked } from "../qrp/index.js";

/**
 * Track how many promises are in flight. `b.state.pending` is a reactive
 * count; `b.active` is true while any are pending.
 *
 * @returns {object} { state, run, active }
 */
export const busyWhile = () => {
	const self = state({ pending: 0 });

	return {
		state: self,

		/**
		 * Wrap a promise so it counts toward busy while it settles.
		 * @param {Promise} promise
		 * @returns {Promise} the same promise
		 */
		run: (promise) => {
			// `+= 1` READS `pending`; untracked keeps a run() called from inside
			// an effect from subscribing that effect to the counter it bumps
			// (which would re-run it, call run() again, and loop forever).
			untracked(() => {
				self.pending += 1;
			});

			return Promise.resolve(promise).finally(() => untracked(() => {
				self.pending -= 1;
			}));
		},

		// Reactive when read inside an effect().
		get active() {
			return self.pending > 0;
		}
	};
};
