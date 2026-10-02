import { parseDraft } from "./draft.ts";
import assert from "node:assert";
assert.deepStrictEqual(parseDraft("8 of us, 5k every Friday, called CSC 300L Squad"), { size: 8, contribution: 5000, period: "Weekly", name: "CSC 300L Squad" });
assert.deepStrictEqual(parseDraft("₦2,000 monthly for 6 people"), { size: 6, contribution: 2000, period: "Monthly" });
assert.deepStrictEqual(parseDraft("10 people 3000 weekly"), { size: 10, contribution: 3000, period: "Weekly" });
console.log("draft ok");
