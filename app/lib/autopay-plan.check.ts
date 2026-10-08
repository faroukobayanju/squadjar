import { dueMembers } from "./autopay-plan.ts";
import assert from "node:assert";

const A = "0xAAaa000000000000000000000000000000000001";
const B = "0xbbbb000000000000000000000000000000000002";
const C = "0xcccc000000000000000000000000000000000003";
const v = { state: 2, roundDeadline: 200n, roundLength: 100, members: [A, B, C], paidThisRound: [false, true, false] };

assert.deepEqual(dueMembers(v, [A.toLowerCase(), B, C], 99n), []); // round not open yet
assert.deepEqual(dueMembers(v, [A.toLowerCase(), B], 100n), [A]); // B paid; case-insensitive match
assert.deepEqual(dueMembers(v, [C], 100n), [C]); // C unpaid
assert.deepEqual(dueMembers(v, [B], 150n), []); // only opted-in members
assert.deepEqual(dueMembers({ ...v, state: 3 }, [A], 150n), []); // not Active
console.log("autopay-plan ok");
