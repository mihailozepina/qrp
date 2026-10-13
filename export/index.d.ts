/**
 * @module export
 * "Get this data out" — `toCSV` / `download` / `copy`. Zero-dep, pairs with
 * table/collection: `download(toCSV(view.filtered(), columns), "data.csv")`.
 */

export type ExportColumn =
	| string
	| { key: string; label?: string; value?: (row: any) => unknown; accessor?: (row: any) => unknown };

export interface ToCSVOptions {
	/**
	 * Prefix string cells (and header labels) starting with = + - @ or tab/CR with
	 * `'` so spreadsheets don't run them as formulas (CSV injection). Numbers and
	 * numeric strings ("-5") are never changed. Default `true`.
	 */
	formulaGuard?: boolean;
}

/**
 * Rows → a CSV string (RFC-4180 quoting). Columns default to the first row's keys.
 * Formula-looking string cells are guarded by default — see {@link ToCSVOptions}.
 */
export function toCSV(rows: readonly any[], columns?: readonly ExportColumn[], options?: ToCSVOptions): string;
/** Trigger a browser download of `content` (string or Blob) as `filename`. */
export function download(content: string | Blob, filename: string, type?: string): void;
/** Copy text to the clipboard; returns the clipboard promise. */
export function copy(text: string): Promise<void>;
