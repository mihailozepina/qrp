/**
 * export/index.js — "get this data out": toCSV / download / copy. Zero-dep,
 * pairs with table/collection (`download(toCSV(view.filtered(), columns), …)`).
 * Every dashboard needs it; nobody should hand-roll CSV escaping again.
 */

// CSV/formula injection (OWASP): a spreadsheet runs a cell that starts with
// = + - @ (or tab/CR) as a formula. Prefixing a single quote makes it text.
// Only STRING cells are guarded, and never a numeric-looking one: a plain or
// formatted number ("-5", "+1.5e3", "-1,234.50", "-10%", "-$5", "+381 64 123")
// or a lone "-" placeholder. With no letters, parens or operators past the
// sign, those can't call a function, and format's output must stay numbers.
const FORMULA_START = /^[=+\-@\t\r]/;
const NUMERIC = /^[+-]?\p{Sc}?[\d.,' \u00a0\u202f]*\d[\d.,' \u00a0\u202f]*([eE][+-]?\d+)?[ \u00a0\u202f]?[%\p{Sc}]?$/u;

const isSafe = (value) => value === "-" || NUMERIC.test(value);

const guardFormula = (value) =>
	typeof value === "string" && FORMULA_START.test(value) && !isSafe(value) ? `'${value}` : value;

const escapeCell = (value, guard) => {
	const raw = guard ? guardFormula(value) : value;
	const s = raw == null ? "" : String(raw);

	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
};

// Normalize a column spec to { label, value }. A string is a key; an object may
// give { key, label?, value?/accessor? } (matches table's field descriptors).
const normalizeColumn = (column) => {
	if(typeof column === "string") {
		return { label: column, value: (row) => row[column] };
	}

	return {
		label: column.label != null ? column.label : column.key,
		value: column.value || column.accessor || ((row) => row[column.key])
	};
};

/**
 * Rows → a CSV string (RFC-4180 quoting). `columns` is a list of key strings or
 * `{ key, label?, value? }` descriptors; omitted, it uses the first row's keys.
 *
 * By default string cells (and header labels) that start with = + - @ or a
 * tab/CR are prefixed with `'` so Excel/Sheets treat them as text, not formulas
 * (CSV injection). Numbers, numeric strings — including formatted ones like
 * "-1,234.50", "-10%", "-$5" — and a lone "-" are left as-is. Pass
 * `{ formulaGuard: false }` for the raw values (e.g. a CSV for another program).
 *
 * @param {object[]} rows
 * @param {Array<string|object>} [columns]
 * @param {object} [options]
 * @param {boolean} [options.formulaGuard] prefix formula-looking strings with ' (default true)
 * @returns {string}
 */
export const toCSV = (rows, columns, options = {}) => {
	const guard = options.formulaGuard !== false;
	const source = columns && columns.length ? columns : Object.keys(rows[0] || {});
	const cols = source.map(normalizeColumn);
	const header = cols.map((c) => escapeCell(c.label, guard)).join(",");
	const body = rows.map((row) => cols.map((c) => escapeCell(c.value(row), guard)).join(",")).join("\r\n");

	return rows.length ? `${header}\r\n${body}` : header;
};

/** Trigger a browser download of `content` (string or Blob) as `filename`. */
export const download = (content, filename, type = "text/csv;charset=utf-8") => {
	const blob = content instanceof Blob ? content : new Blob([content], { type });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");

	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
};

/** Copy text to the clipboard; returns the clipboard promise. */
export const copy = (text) => navigator.clipboard.writeText(text);
