/**
 * @module collection
 * Reactive sort / filter / paginate over a dataset. `collection(source, options)`
 * returns `{ sort, filter, page, items(), filtered(), total(), pageCount(),
 * pageIndex(), toggleSort() }`;
 * `items()` is reactive — feed it to `list()`. `options`:
 * `{ sort?, page?, filter?, filterFn?, compare? }`. `compareValues(a, b, dir?)`
 * is the default comparator (missing values last, numbers/Dates numeric, else
 * natural-order strings) — reuse it inside a custom `compare`.
 */
export interface SortState {
	key: string | null;
	/** 1 ascending, -1 descending. */
	dir?: number;
}

export interface PageState {
	index: number;
	/** items per page; 0 = no paging. */
	size: number;
}

export interface CollectionOptions<T> {
	/**
	 * Sort state. A plain object literal is wrapped in `state()` for you; pass
	 * `state({ key, dir })` when you want a handle to drive the sort yourself.
	 */
	sort?: SortState;
	page?: PageState;
	filter?: Record<string, any>;
	filterFn?: (item: T, filter: Record<string, any>) => boolean;
	compare?: (a: T, b: T, sort: SortState) => number;
}

export interface Collection<T> {
	sort: SortState;
	filter: Record<string, any>;
	page: PageState;
	/** Reactive: sorted → filtered → paged items. Feed to list(). */
	items(): T[];
	/** Reactive: the full filtered set (unpaged, unsorted) — for select-all/export. */
	filtered(): T[];
	/** Count after filtering (before paging). */
	total(): number;
	/** Number of pages at the current size. */
	pageCount(): number;
	/**
	 * Reactive: the page `items()` shows — `page.index` clamped to
	 * [0, pageCount-1]. After a filter shrinks the set, `page.index` may be out
	 * of range; pagers and "Showing X–Y" summaries should read this instead.
	 */
	pageIndex(): number;
	/** Toggle sort direction on the same key, else sort by it ascending. */
	toggleSort(key: string): void;
}

/** Reactive sort / filter / paginate over a dataset. */
export function collection<T>(source: () => readonly T[], options?: CollectionOptions<T>): Collection<T>;

/**
 * The default sort comparator: null/undefined/NaN always last (either
 * direction), numbers and Dates numerically, everything else by natural-order
 * string comparison. `dir` is 1 (ascending, default) or -1.
 */
export function compareValues(a: unknown, b: unknown, dir?: number): number;
