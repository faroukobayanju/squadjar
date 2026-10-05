import { slugify } from "./slug.ts";
import assert from "node:assert";
const none = async () => false;
assert.strictEqual(await slugify("CSC 300L Squad", none), "csc-300l-squad");
assert.strictEqual(await slugify("!!!", none), "squad");
const taken = new Set(["csc-300l-squad", "csc-300l-squad-2"]);
assert.strictEqual(await slugify("CSC 300L Squad", async (s) => taken.has(s)), "csc-300l-squad-3");
assert.strictEqual(await slugify("CSC 300L Squad", async (s) => s === "csc-300l-squad"), "csc-300l-squad-2");
console.log("slug ok");
