import assert from "node:assert";
import { amountProblem, maskAccount, normUsername, validAccountNumber } from "./money-out.ts";

assert.ok(validAccountNumber("0123456789"));
for (const s of ["012345678", "01234567890", "01234 5678", "abcdefghij", ""]) assert.ok(!validAccountNumber(s), s);
assert.strictEqual(maskAccount("0123454821"), "••••4821");
assert.strictEqual(normUsername(" @Ada_1 "), "ada_1");
for (const s of ["@ab", "a b c", "toolongusername_12345", "ada!", ""]) assert.strictEqual(normUsername(s), null, s);
assert.strictEqual(amountProblem(99, 1000), "min");
assert.strictEqual(amountProblem(0, 1000), "min");
assert.strictEqual(amountProblem(NaN, 1000), "min");
assert.strictEqual(amountProblem(100, 1000), null);
assert.strictEqual(amountProblem(1000, 1000), null);
assert.strictEqual(amountProblem(1001, 1000), "short");
console.log("money-out ok");
