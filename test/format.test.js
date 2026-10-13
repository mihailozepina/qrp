import test from "node:test";
import assert from "node:assert/strict";
import { num, compact, pct, bytes, duration, relTime, date } from "../format/index.js";

test("format: num/compact/pct/bytes", () => {
	assert.equal(num(1234.5), "1,234.5");
	assert.equal(compact(43373), "43.4K");
	assert.equal(pct(0.13), "13%");
	assert.equal(bytes(1536), "1.5 KB");
	assert.equal(bytes(500), "500 B");
});

test("format: duration picks the largest unit", () => {
	assert.equal(duration(87 * 864e5), "2.9 months");
	assert.match(duration(90 * 1000), /1\.5 minutes/);
});

test("format: relTime + date", () => {
	assert.equal(relTime(new Date(Date.now() - 2 * 36e5)), "2 hours ago");
	assert.match(date("2026-07-17T00:00:00Z", { dateStyle: "medium", timeZone: "UTC" }), /2026/);
});

test("format: nullish/NaN → empty string", () => {
	assert.equal(num(null), "");
	assert.equal(compact(undefined), "");
	assert.equal(bytes(NaN), "");
	assert.equal(date(null), "");
});

test("format: invalid dates → empty string, not a RangeError", () => {
	assert.equal(relTime("not a date"), "");
	assert.equal(relTime(NaN), "");
	assert.equal(relTime(new Date(NaN)), "");
	assert.equal(date("not a date"), "");
	assert.equal(date(NaN), "");
	assert.equal(date(new Date(NaN)), "");
});

test("format: a larger minimumFractionDigits widens the default maximum", () => {
	assert.equal(pct(0.1234, { minimumFractionDigits: 2 }), "12.34%");
	assert.equal(compact(43373, { minimumFractionDigits: 2 }), "43.37K");
	assert.equal(bytes(1536, { minimumFractionDigits: 2 }), "1.50 KB");
	assert.equal(bytes(500, { minimumFractionDigits: 2 }), "500.00 B");
	assert.equal(duration(90000, { minimumFractionDigits: 2 }), "1.50 minutes");
	// an explicit maximumFractionDigits still wins
	assert.equal(pct(0.1234, { maximumFractionDigits: 1 }), "12.3%");
	assert.equal(bytes(1536, { maximumFractionDigits: 0 }), "2 KB");
});

test("format: the unit is chosen after rounding", () => {
	assert.equal(bytes(1048575), "1 MB");
	assert.equal(bytes(1023.6), "1 KB");
	assert.equal(bytes(-1048575), "-1 MB");
	assert.equal(bytes(1023.6, { maximumFractionDigits: 1 }), "1,023.6 B");
	assert.equal(duration(59999), "1 minute");
	assert.equal(duration(864e5 - 1), "1 day");
	assert.equal(duration(59999, { maximumFractionDigits: 3 }), "59.999 seconds");
	assert.equal(relTime(Date.now() - 59600), "1 minute ago");
	assert.equal(relTime(Date.now() - 3599e3 - 600), "1 hour ago");
});
