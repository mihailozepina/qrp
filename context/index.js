/**
 * context/index.js — values a subtree provides and its descendants read, found
 * through the DOM. The qrp take on React context, for compound components
 * (Tabs → TabsTrigger, a sidebar provider → its parts, a form → its fields).
 *
 * Children are built BEFORE their parent — `Tabs(TabsList(TabsTrigger()))`
 * evaluates the trigger first — so a read at construction time can't see the
 * provider yet. qrp has no lifecycle hooks to wait for, so reads are reactive
 * instead:
 *
 * - `read()` inside an effect / reactive prop tracks the context, and
 *   `provide()` re-runs those readers — by then the children are inside the
 *   provider's element, so the second read finds it.
 * - A reader whose node is still detached (a list()/when() row built before it
 *   is inserted) gets ONE microtask retry, by which time it is normally in the
 *   tree. One per node, so a node that never attaches can't loop.
 * - Portaled content (an overlay moved to <body>) resolves through its logical
 *   owner: `setOwner(node, owner)`, which `behaviors/portal` records for you.
 *
 *   const TabsContext = createContext(null);
 *   const Tabs = (...children) => TabsContext.provide(el("div", {}, ...children), controller);
 *   const TabsTrigger = (value, label) => TabsContext.watch(el("button", {}, label), (tabs, node) => {
 *     node.setAttribute("aria-selected", String(tabs?.value === value));
 *   });
 *
 * (A reactive prop can't read its own element — `el()` runs it before the
 * `const node = el(…)` assignment — so attach the read afterwards with watch(),
 * or use read() lazily in handlers and later effects.)
 */

import { state, effect } from "../qrp/index.js";

const owners = new WeakMap();
const ownership = state({ version: 0 });

let retryQueued = false;
const retryQueue = new Set();

/**
 * The node's parent for context lookup: its logical owner if one was set (a
 * portaled overlay → its trigger), else its DOM parent, else a shadow host.
 */
const parentOf = (node) => owners.get(node) || node.parentNode || node.host || null;

/** True when the node's ancestor chain (owners included) reaches a document. */
const isRooted = (node) => {
	let current = node;

	while(current) {
		if(current.nodeType === 9) {
			return true;
		}

		current = parentOf(current);
	}

	return false;
};

const flushRetries = () => {
	retryQueued = false;

	const contexts = [...retryQueue];

	retryQueue.clear();
	contexts.forEach((bump) => bump());
};

/**
 * Give `node` a logical parent for context lookup — for content that lives
 * elsewhere in the DOM than where it belongs (an overlay portaled to <body>).
 *
 * @param {Node} node
 * @param {Node|null} owner the node to resolve contexts through; null clears it
 * @returns {Node} node
 */
export const setOwner = (node, owner) => {
	if(owner) {
		owners.set(node, owner);
	} else {
		owners.delete(node);
	}

	ownership.version += 1;

	return node;
};

/** The logical owner set with setOwner, if any. */
export const ownerOf = (node) => owners.get(node) || null;

/**
 * Create a context.
 *
 * @param {*} [fallback] value read() returns when no provider is found
 * @returns {{ provide: Function, read: Function, find: Function }}
 */
export const createContext = (fallback) => {
	const values = new WeakMap();
	const retried = new WeakSet();
	const tracker = state({ version: 0 });
	const bump = () => { tracker.version += 1; };

	/**
	 * Untracked lookup: the nearest provided value and whether one was found.
	 *
	 * @param {Node} node where to start (inclusive)
	 * @returns {{ found: boolean, value: *, provider: Node|null }}
	 */
	const find = (node) => {
		let current = node;

		while(current) {
			if(values.has(current)) {
				return { found: true, value: values.get(current), provider: current };
			}

			current = parentOf(current);
		}

		return { found: false, value: fallback, provider: null };
	};

	/**
	 * The nearest value provided above `node` (inclusive), or the fallback.
	 * Reactive: inside an effect it re-runs when a provider appears, so reading
	 * during construction is fine.
	 *
	 * @param {Node} node
	 * @returns {*}
	 */
	const read = (node) => {
		// Track this context and ownership changes.
		void tracker.version;
		void ownership.version;

		const result = find(node);

		if(!result.found && !isRooted(node) && !retried.has(node)) {
			retried.add(node);
			retryQueue.add(bump);

			if(!retryQueued) {
				retryQueued = true;
				queueMicrotask(flushRetries);
			}
		}

		return result.value;
	};

	/**
	 * Provide `value` to `node`'s subtree (and re-run readers that ran early).
	 *
	 * @param {Node} node
	 * @param {*} value
	 * @returns {Node} node, for inline use: `provide(el(...), controller)`
	 */
	const provide = (node, value) => {
		values.set(node, value);
		bump();

		return node;
	};

	/**
	 * Run `fn(value, node)` in an effect now and whenever the context changes
	 * for `node` (a provider appears, or provided state that `fn` reads
	 * changes). Owned by the current scope like any effect.
	 *
	 * @param {Node} node
	 * @param {Function} fn (value, node) => void
	 * @returns {Node} node, for inline use
	 */
	const watch = (node, fn) => {
		effect(() => fn(read(node), node));

		return node;
	};

	return { provide, read, watch, find };
};
