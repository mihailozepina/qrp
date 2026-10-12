/**
 * @module context
 * Values a subtree provides and its descendants read, found through the DOM —
 * the qrp take on React context, for compound components (Tabs → its
 * triggers, a sidebar provider → its parts). `createContext(fallback)` returns
 * `{ provide, read, watch, find }`. Children are built before their parent, so `read`
 * is reactive: inside an effect or reactive prop it re-runs when a provider
 * appears (and once more, on a microtask, for a node still being inserted).
 * Portaled content resolves through its owner (`setOwner`; `portal` records it).
 * @example
 * const TabsContext = createContext(null);
 * const Tabs = (...children) => TabsContext.provide(el("div", {}, ...children), controller);
 * const TabsTrigger = (value, label) => TabsContext.watch(el("button", {}, label), (tabs, node) => {
 *   node.setAttribute("aria-selected", String(tabs?.value === value));
 * });
 */

/** A context created by createContext(). */
export interface Context<T> {
	/** Provide `value` to `node`'s subtree; returns `node` for inline use. */
	provide<N extends Node>(node: N, value: T): N;
	/**
	 * The nearest value provided above `node` (inclusive), or the fallback.
	 * Reactive — read it inside an effect / reactive prop, not just once.
	 */
	read(node: Node): T;
	/**
	 * Run `fn(value, node)` in an effect now and whenever the context changes for
	 * `node`; returns `node`. Use this for reads that bind to the element itself
	 * (a reactive prop can't reference the element `el()` is still building).
	 */
	watch<N extends Node>(node: N, fn: (value: T, node: N) => void): N;
	/** Untracked lookup: the value, whether it was found, and the providing node. */
	find(node: Node): { found: boolean; value: T; provider: Node | null };
}

/** Create a context; `fallback` is what read() returns with no provider above. */
export function createContext<T>(fallback?: T): Context<T>;

/**
 * Give `node` a logical parent for context lookup — for content that lives
 * elsewhere in the DOM than where it belongs (an overlay portaled to <body>).
 * `null` clears it. Returns `node`. Readers re-run on a microtask (coalesced),
 * never synchronously — so calling it mid-update (portal() inside an effect)
 * can't re-enter that effect.
 */
export function setOwner<N extends Node>(node: N, owner: Node | null): N;

/** The logical owner set with setOwner, if any. */
export function ownerOf(node: Node): Node | null;
