/**
 * format/index.js — Intl-backed pure formatters for dashboards.
 *
 * Zero-dependency (Intl is built into the platform), pure, and impossible to get
 * subtly wrong by hand. Every function returns "" for nullish/NaN input so it's
 * safe straight inside a reactive binding (`() => num(row.value)`), and takes an
 * optional Intl options object to override defaults. Locale is the runtime
 * default; pass `{ ... }` (or a full Intl instance upstream) to pin one.
 */

const nf = (opts) => new Intl.NumberFormat(undefined, opts);
const bad = (value) => value == null || (typeof value === "number" && Number.isNaN(value));
const toDate = (value) => (value instanceof Date ? value : new Date(value));

// A default maximumFractionDigits that never undercuts the caller's
// minimumFractionDigits (Intl throws a RangeError when min > max).
const maxFraction = (fallback, opts) => Math.max(fallback, opts.minimumFractionDigits ?? 0);

// The fraction digits a value will actually be shown with: the caller's
// explicit maximumFractionDigits, else the (widened) default.
const shownDigits = (fallback, opts) => opts.maximumFractionDigits ?? maxFraction(fallback, opts);

// `n` rounded exactly as Intl will display it, so a unit can be picked after rounding.
const rounded = (n, digits) =>
	Number(new Intl.NumberFormat("en", { useGrouping: false, maximumFractionDigits: digits }).format(n));

/** A plain number: `num(1234.5)` → "1,234.5". Pass Intl.NumberFormat options. */
export const num = (value, opts = {}) => (bad(value) ? "" : nf(opts).format(value));

/** Compact notation: `compact(43373)` → "43.4K". */
export const compact = (value, opts = {}) =>
	num(value, { notation: "compact", maximumFractionDigits: maxFraction(1, opts), ...opts });

/** Percent of a 0–1 ratio: `pct(0.13)` → "13%". */
export const pct = (value, opts = {}) =>
	(bad(value) ? "" : nf({ style: "percent", maximumFractionDigits: maxFraction(0, opts), ...opts }).format(value));

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

/** Human bytes (base 1024): `bytes(1536)` → "1.5 KB". */
export const bytes = (value, opts = {}) => {
	if(bad(value)) { return ""; }

	const sign = value < 0 ? -1 : 1;
	let n = Math.abs(value);
	let unit = 0;

	while(n >= 1024 && unit < BYTE_UNITS.length - 1) {
		n /= 1024;
		unit += 1;
	}

	const fallback = () => (unit === 0 ? 0 : 1);

	// 1023.96 KB would display as "1,024 KB": step up once rounding reaches 1024.
	if(unit < BYTE_UNITS.length - 1 && rounded(n, shownDigits(fallback(), opts)) >= 1024) {
		n /= 1024;
		unit += 1;
	}

	return `${num(sign * n, { maximumFractionDigits: maxFraction(fallback(), opts), ...opts })} ${BYTE_UNITS[unit]}`;
};

// [Intl unit identifier, milliseconds] — all sanctioned Intl units, largest first.
const SPANS = [
	["year", 31536e6], ["month", 2592e6], ["week", 6048e5], ["day", 864e5],
	["hour", 36e5], ["minute", 6e4], ["second", 1e3]
];

// The largest unit `ms` fills — judged after rounding to `digits`, so 59.99 s
// shown with 1 digit is "1 minute", not "60 seconds".
const largestSpan = (ms, digits) => {
	const found = SPANS.findIndex(([, size]) => Math.abs(ms) >= size);
	const i = found === -1 ? SPANS.length - 1 : found;
	const size = SPANS[i][1];

	return i > 0 && rounded(Math.abs(ms) / size, digits) * size >= SPANS[i - 1][1] ? SPANS[i - 1] : SPANS[i];
};

/** Human duration from milliseconds: `duration(87*864e5)` → "2.9 months". */
export const duration = (ms, opts = {}) => {
	if(bad(ms)) { return ""; }

	const [unit, size] = largestSpan(ms, shownDigits(1, opts));

	return nf({ style: "unit", unit, unitDisplay: "long", maximumFractionDigits: maxFraction(1, opts), ...opts }).format(ms / size);
};

/** Relative time vs now (Intl.RelativeTimeFormat): `relTime(iso)` → "2 hours ago". */
export const relTime = (value, opts = {}) => {
	const time = value == null ? NaN : toDate(value).getTime();

	if(!Number.isFinite(time)) { return ""; }

	const diff = time - Date.now();
	const [unit, size] = largestSpan(diff, 0);

	return new Intl.RelativeTimeFormat(undefined, { numeric: "auto", ...opts }).format(Math.round(diff / size), unit);
};

/** A date/time (Intl.DateTimeFormat): `date(iso)` → "Jul 17, 2026". */
export const date = (value, opts = { dateStyle: "medium" }) => {
	const when = value == null ? null : toDate(value);

	return when && Number.isFinite(when.getTime()) ? new Intl.DateTimeFormat(undefined, opts).format(when) : "";
};
