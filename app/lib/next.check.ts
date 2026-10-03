import { safeNext } from "./next.ts";
import assert from "node:assert";
assert.strictEqual(safeNext("//evil"), "/home");
assert.strictEqual(safeNext("/\\evil"), "/home");
assert.strictEqual(safeNext("https://evil.com"), "/home");
assert.strictEqual(safeNext("/s/x?code=1"), "/s/x?code=1");
assert.strictEqual(safeNext(undefined), "/home");
assert.strictEqual(safeNext(undefined, "/x"), "/x");
console.log("next ok");
