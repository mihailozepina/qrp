import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// docs/API.md is generated from the .d.ts by bin/gen-api.js. A signature cut
// short (e.g. at the ">" of an arrow) leaves unbalanced brackets in its block.
const api = fs.readFileSync(new URL("../docs/API.md", import.meta.url), "utf8");
const blocks = Array.from(api.matchAll(/```ts\n([\s\S]*?)\n```/g), (m) => m[1]);

const unbalanced = (code) => {
	const stripped = code
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "")
		.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "\"\"")
		.replace(/=>/g, "");
	const pairs = { ")": "(", "]": "[", "}": "{", ">": "<" };
	const stack = [];

	const bad = Array.from(stripped).some((c) => {
		if("([{<".includes(c)) {
			stack.push(c);

			return false;
		}

		if(pairs[c]) {
			return stack.pop() !== pairs[c];
		}

		return false;
	});

	return bad || stack.length > 0;
};

test("docs/API.md signatures have balanced brackets (no truncated declarations)", () => {
	assert.ok(blocks.length > 50, "found the generated signature blocks");

	const broken = blocks.filter(unbalanced).map((b) => b.split("\n")[0]);
	assert.deepEqual(broken, []);
});
