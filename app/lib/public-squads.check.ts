import { canRequest, codeReleasable } from "./public-squads.ts";
import assert from "node:assert";

assert.strictEqual(canRequest({ tier: 0, minTier: 0 }), true);
assert.strictEqual(canRequest({ tier: 0, minTier: 1 }), false);
assert.strictEqual(canRequest({ tier: 2, minTier: 1 }), true);

const pub = { isPublic: true, tier: 1, minTier: 1 };
// Members always get the code, private or public, whatever their tier.
assert.strictEqual(codeReleasable({ isMember: true, isPublic: false, tier: 0, minTier: 0, requestStatus: null }), true);
assert.strictEqual(codeReleasable({ ...pub, isMember: true, tier: 0, requestStatus: null }), true);
// Private squads: members only, even with an accepted request row.
assert.strictEqual(codeReleasable({ isMember: false, isPublic: false, tier: 2, minTier: 0, requestStatus: "accepted" }), false);
// Public: accepted and still meets the tier.
assert.strictEqual(codeReleasable({ ...pub, isMember: false, requestStatus: "accepted" }), true);
assert.strictEqual(codeReleasable({ ...pub, isMember: false, tier: 0, requestStatus: "accepted" }), false);
for (const s of [null, "pending", "declined"] as const) assert.strictEqual(codeReleasable({ ...pub, isMember: false, requestStatus: s }), false);
console.log("public-squads ok");
