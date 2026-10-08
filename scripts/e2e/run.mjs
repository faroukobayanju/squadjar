// End-to-end check of the deployed Squadjar contracts against a local anvil fork of Monad testnet.
// Usage: scripts/e2e/run.sh   (or: RPC_URL=http://127.0.0.1:8547 node scripts/e2e/run.mjs with anvil already forking)
// Members are made-up addresses impersonated on anvil: no keys, no real MON, sNGN from faucet().
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const viemDir = process.env.VIEM_DIR ?? join(root, 'app', 'node_modules', 'viem');
const {
  createPublicClient, createWalletClient, http, defineChain, parseEventLogs, keccak256, toHex,
  encodeAbiParameters, formatUnits, maxUint256, getAddress,
} = await import(pathToFileURL(join(viemDir, '_esm', 'index.js')).href);

const RPC = process.env.RPC_URL ?? 'http://127.0.0.1:8547';
const abi = (n) => JSON.parse(readFileSync(join(root, 'contracts', 'abi', `${n}.json`), 'utf8'));
const errorsOf = (a) => a.filter((x) => x.type === 'error');
const tokenAbi = abi('AjoNGN');
const registryAbi = abi('TrustRegistry');
const squadAbi = [...abi('Squad'), ...errorsOf(tokenAbi), ...errorsOf(registryAbi)];
const factoryAbi = [...abi('SquadFactory'), ...errorsOf(registryAbi)];

const pub0 = createPublicClient({ transport: http(RPC) });
const chainId = await pub0.getChainId();
const dep = JSON.parse(readFileSync(join(root, 'contracts', 'deployments', `${chainId}.json`), 'utf8'));
const chain = defineChain({
  id: chainId, name: 'fork', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const pub = createPublicClient({ chain, transport: http(RPC), pollingInterval: 20 });
const wallet = createWalletClient({ chain, transport: http(RPC), pollingInterval: 20 });
const rpc = (method, params = []) => pub.request({ method, params });

const E = 10n ** 18n;
const DAY = 86400n;
const WEEK = 7n * DAY;
const State = ['Open', 'Depositing', 'Active', 'Completed', 'Cancelled'];
const fmt = (x) => `₦${formatUnits(x, 18)}`;

// ---------- chain helpers ----------
const now = async () => (await pub.getBlock()).timestamp;
async function warp(ts) {
  if (ts > (await now())) await rpc('evm_setNextBlockTimestamp', [toHex(ts)]);
  await rpc('evm_mine');
}
// Gas limit = estimate * 1.5: start() sorts by a prevrandao-keyed tiebreak, so the block it lands in can take
// a costlier insertion-sort path than the one estimated (a plain estimate ran out of gas on ~half of starts).
const gasLog = [];
async function send(from, address, abi_, functionName, args = []) {
  const req = { account: from, address, abi: abi_, functionName, args, chain };
  const est = await pub.estimateContractGas(req);
  const hash = await wallet.writeContract({ ...req, gas: (est * 3n) / 2n });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${functionName} reverted (${hash})`);
  if (functionName === 'start') gasLog.push({ est, used: r.gasUsed });
  return r;
}
const read = (address, abi_, functionName, args = []) => pub.readContract({ address, abi: abi_, functionName, args });
const bal = (a) => read(dep.token, tokenAbi, 'balanceOf', [a]);
const events = (r, eventName) => parseEventLogs({ abi: squadAbi, logs: r.logs, eventName }).map((l) => l.args);
async function revertName(from, address, abi_, functionName, args = []) {
  try {
    await pub.simulateContract({ account: from, address, abi: abi_, functionName, args });
    return { name: null };
  } catch (e) {
    const err = e.walk?.((x) => x?.data?.errorName) ?? e;
    return { name: err?.data?.errorName ?? e.shortMessage, args: err?.data?.args };
  }
}

// Fresh addresses per run (salted by wall clock) so a reused anvil never carries trust records over.
const salt = (Date.now() % 0xffffffff).toString(16).padStart(8, '0');
let nextId = 1;
async function makeMembers(k) {
  const out = [];
  for (let i = 0; i < k; i++) {
    const a = getAddress(`0x000000000000000000000000e2e0${salt}${(nextId++).toString(16).padStart(4, '0')}`);
    await rpc('anvil_impersonateAccount', [a]);
    await rpc('anvil_setBalance', [a, toHex(1000n * E)]);
    await send(a, dep.token, tokenAbi, 'faucet', [50_000n * E]);
    out.push(a);
  }
  return out;
}

// Creates, joins, approves. Returns { squad, members, start: Map(member => sNGN balance) }.
async function setup({ n, c, period = 0, firstDeadline = 0n, label }) {
  const members = await makeMembers(n);
  const code = keccak256(toHex(`squadjar-e2e-${label}`));
  const inviteHash = keccak256(encodeAbiParameters([{ type: 'bytes32' }], [code]));
  const r = await send(members[0], dep.factory, factoryAbi, 'createSquad', [c, n, period, inviteHash, firstDeadline]);
  const squad = parseEventLogs({ abi: factoryAbi, logs: r.logs, eventName: 'SquadCreated' })[0].args.squad;
  for (const m of members.slice(1)) await send(m, squad, squadAbi, 'join', [code]);
  for (const m of members) await send(m, dep.token, tokenAbi, 'approve', [squad, maxUint256]);
  const start = new Map();
  for (const m of members) start.set(m, await bal(m));
  return { squad, members, start, organizer: members[0] };
}

const getState = (squad) => read(squad, squadAbi, 'getState');
const idx = (s, m) => s.members.indexOf(m);

// start() goes straight to Active and returns turn order (members[0] = turn 1).
async function start(sq) {
  await send(sq.organizer, sq.squad, squadAbi, 'start');
  return (await getState(sq.squad)).members;
}

// Plays the current round: warp to its opening, `payers` contribute in order, and if anyone
// still paying did not pay, warp past grace and settleRound. Returns the RoundSettled args + receipt.
async function playRound(sq, payers) {
  let s = await getState(sq.squad);
  const round = s.currentRound;
  const opensAt = s.roundDeadline - BigInt(s.roundLength);
  if ((await now()) < opensAt) await warp(opensAt);
  let r;
  for (const m of payers) r = await send(m, sq.squad, squadAbi, 'contribute');
  s = await getState(sq.squad);
  if (s.state === 2 && s.currentRound === round) {
    await warp(s.settleableAfter + 1n);
    r = await send(payers[0] ?? sq.organizer, sq.squad, squadAbi, 'settleRound', [round]);
  }
  const settled = events(r, 'RoundSettled')[0];
  if (!settled || settled.round !== round) throw new Error(`round ${round} did not settle`);
  return { ...settled, receipt: r };
}

// ---------- reporting ----------
const results = [];
let cur;
function check(label, ok, detail = '') {
  cur.checks.push({ label, ok: !!ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}
const eq = (label, got, want, show = (x) => String(x)) => check(label, got === want, `got ${show(got)}, want ${show(want)}`);
async function scenario(name, fn) {
  cur = { name, checks: [], error: null };
  results.push(cur);
  console.log(`\n== ${name}`);
  try {
    await fn();
  } catch (e) {
    cur.error = e.shortMessage ?? e.message;
    console.log(`  FAIL  threw: ${cur.error}`);
  }
}
async function jarEmpty(sq) {
  eq('jar (squad sNGN balance) is 0', await bal(sq.squad), 0n, fmt);
}
async function balancesUnchanged(sq, who = sq.members) {
  for (const m of who) eq(`${m.slice(-4)} ends with starting balance`, await bal(m), sq.start.get(m), fmt);
}

// Snapshot of registry records for every member of a Demo squad, compared in scenario 8.
const demoMembers = [];
const record = async (m) => {
  const [onTime, late, missed, completed] = await read(dep.registry, registryAbi, 'records', [m]);
  return { onTime, late, missed, completed };
};

// ================= scenarios =================
// Every member here is New (fresh addresses, allowance 0), so a collector in round r of n holds (n - r)·c of the
// payout, capped at what is left of it. Expected numbers are worked out from Squad.sol _settle/_payCredits/_finish.
const C2 = 2000n * E;
const heldOf = (r) => events(r, 'PayoutHeld')[0]?.amount ?? 0n;

// r1: pool 3c, held 2c -> c now. r2: held c -> 2c now. r3: last turn holds nothing -> 3c. _finish returns 2c and c.
await scenario('1 Happy path (Demo, 3 members, c=₦2,000): no deposit, held money comes back', async () => {
  const sq = await setup({ n: 3, c: C2, label: 's1' });
  demoMembers.push(...sq.members);
  const o = await start(sq);
  const s0 = await getState(sq.squad);
  eq('start goes straight to Active', State[s0.state], 'Active');
  eq('round 1 is open', s0.currentRound, 1);
  eq('jar holds nothing at start', await bal(sq.squad), 0n, fmt);
  check('every allowance 0 (New)', s0.allowance.every((x) => x === 0), s0.allowance.join());
  const want = [[C2, 2n * C2], [2n * C2, C2], [3n * C2, 0n]];
  for (let r = 1; r <= 3; r++) {
    const ev = await playRound(sq, o);
    eq(`round ${r} collector is turn ${r}`, ev.collector, o[r - 1]);
    eq(`round ${r} RoundSettled amount (now)`, ev.amount, want[r - 1][0], fmt);
    eq(`round ${r} PayoutHeld amount (waits in the jar)`, heldOf(ev.receipt), want[r - 1][1], fmt);
    if (r === 1) eq('after r1: locked(turn 1) = 2c', (await getState(sq.squad)).locked[0], 2n * C2, fmt);
  }
  eq('state Completed', State[(await getState(sq.squad)).state], 'Completed');
  await balancesUnchanged(sq);
  await jarEmpty(sq);
});

// z = turn 3 misses r1 with nothing held: debt c, credit c to turn 1, whose payout (pool 2c, held 2c) is ₦0 now.
// z pays back c: it goes straight to turn 1 (CreditPaid). Then r2, r3 as normal.
await scenario('2 Round 1 miss -> debt -> pay back', async () => {
  const sq = await setup({ n: 3, c: C2, label: 's2' });
  demoMembers.push(...sq.members);
  const o = await start(sq);
  const z = o[2];
  const ev1 = await playRound(sq, [o[0], o[1]]);
  check('round 1 missed[] = [z]', ev1.missed.length === 1 && ev1.missed[0] === z, ev1.missed.join());
  eq('round 1: turn 1 gets ₦0 now (pool 2c, all held)', ev1.amount, 0n, fmt);
  eq('round 1: PayoutHeld 2c', heldOf(ev1.receipt), 2n * C2, fmt);
  let s = await getState(sq.squad);
  eq('owed(z) = c', s.owed[idx(s, z)], C2, fmt);
  eq('credit(turn 1) = c', s.credit[0], C2, fmt);
  eq('misses(z) = 1', s.misses[idx(s, z)], 1);
  const before = await bal(o[0]);
  const r = await send(z, sq.squad, squadAbi, 'payBack');
  check('PaidBack(z, c) emitted', events(r, 'PaidBack').some((e) => e.member === z && e.amount === C2));
  check('CreditPaid(turn 1, c) emitted', events(r, 'CreditPaid').some((e) => e.member === o[0] && e.amount === C2));
  eq('turn 1 received c straight away', (await bal(o[0])) - before, C2, fmt);
  s = await getState(sq.squad);
  eq('owed(z) = 0', s.owed[idx(s, z)], 0n, fmt);
  eq('credit(turn 1) = 0', s.credit[0], 0n, fmt);
  eq('second payBack reverts NothingOwed', (await revertName(z, sq.squad, squadAbi, 'payBack')).name, 'NothingOwed');
  await playRound(sq, o);
  await playRound(sq, o);
  eq('state Completed', State[(await getState(sq.squad)).state], 'Completed');
  await balancesUnchanged(sq);
  await jarEmpty(sq);
});

// x = turn 1 misses their own round: a smaller pool (2c), no debt; New holds 2c, so x gets ₦0 now and 2c at the end.
await scenario('3 Collector misses their own round', async () => {
  const sq = await setup({ n: 3, c: C2, label: 's3' });
  demoMembers.push(...sq.members);
  const o = await start(sq);
  const x = o[0];
  const ev1 = await playRound(sq, [o[1], o[2]]);
  check('round 1 missed[] = [x]', ev1.missed.length === 1 && ev1.missed[0] === x);
  eq('round 1: x gets ₦0 now', ev1.amount, 0n, fmt);
  eq('round 1: PayoutHeld 2c (whole smaller pool)', heldOf(ev1.receipt), 2n * C2, fmt);
  const s = await getState(sq.squad);
  check('no debt and no credit recorded', s.owed.every((v) => v === 0n) && s.credit.every((v) => v === 0n));
  eq('misses(x) = 1', s.misses[0], 1);
  eq('round 2: turn 2 gets 2c', (await playRound(sq, o)).amount, 2n * C2, fmt);
  eq('round 3: turn 3 gets 3c', (await playRound(sq, o)).amount, 3n * C2, fmt);
  await balancesUnchanged(sq);
  await jarEmpty(sq);
});

// x = turn 1 collects r1 (c now, 2c held), then misses r2 and r3: each miss comes out of x's own held money,
// so turn 2 (pool 3c, held c -> 2c) and turn 3 (3c) are paid in full and x gets nothing back at the end.
await scenario('4 Held money covers later misses', async () => {
  const sq = await setup({ n: 3, c: C2, label: 's4' });
  demoMembers.push(...sq.members);
  const o = await start(sq);
  const x = o[0];
  eq('round 1: x gets c now', (await playRound(sq, o)).amount, C2, fmt);
  const ev2 = await playRound(sq, [o[1], o[2]]);
  eq('round 2 (x misses): turn 2 gets 2c now', ev2.amount, 2n * C2, fmt);
  eq('round 2: PayoutHeld c for turn 2', heldOf(ev2.receipt), C2, fmt);
  let s = await getState(sq.squad);
  eq('locked(x) 2c -> c', s.locked[0], C2, fmt);
  eq('owed(x) = 0 (covered, no debt)', s.owed[0], 0n, fmt);
  eq('credit(turn 2) = 0', s.credit[1], 0n, fmt);
  const ev3 = await playRound(sq, [o[1], o[2]]);
  eq('round 3 (x misses again): turn 3 gets 3c', ev3.amount, 3n * C2, fmt);
  s = await getState(sq.squad);
  eq('state Completed, locked(x) = 0', `${State[s.state]} ${s.locked[0]}`, 'Completed 0');
  eq('misses(x) = 2', s.misses[0], 2);
  await balancesUnchanged(sq);
  await jarEmpty(sq);
});

// y = turn 3 misses r1 (debt c, credit c to turn 1), pays r2, then collects r3: the debt comes out of the payout
// first (CreditPaid to turn 1 in the settle), and the last turn holds nothing, so y gets 3c - c = 2c.
await scenario('5 Debt taken from the misser\'s own payout', async () => {
  const sq = await setup({ n: 3, c: C2, label: 's5' });
  demoMembers.push(...sq.members);
  const o = await start(sq);
  const y = o[2];
  await playRound(sq, [o[0], o[1]]);
  await playRound(sq, o);
  const ev3 = await playRound(sq, o);
  eq('round 3: y gets 2c (3c - c debt)', ev3.amount, 2n * C2, fmt);
  check('CreditPaid(turn 1, c) in the settle', events(ev3.receipt, 'CreditPaid').some((e) => e.member === o[0] && e.amount === C2));
  const s = await getState(sq.squad);
  check('owed and credit all 0', s.owed.every((v) => v === 0n) && s.credit.every((v) => v === 0n));
  eq('state Completed', State[s.state], 'Completed');
  await balancesUnchanged(sq);
  await jarEmpty(sq);
});

await scenario('6 Organizer cancels while Open (the jar never held money)', async () => {
  const sq = await setup({ n: 3, c: C2, label: 's6' });
  eq('non-organizer cancel reverts NotOrganizer', (await revertName(sq.members[1], sq.squad, squadAbi, 'cancel')).name, 'NotOrganizer');
  eq('payBack while Open reverts WrongState', (await revertName(sq.members[1], sq.squad, squadAbi, 'payBack')).name, 'WrongState');
  const r = await send(sq.organizer, sq.squad, squadAbi, 'cancel');
  eq('Cancelled emitted', events(r, 'Cancelled').length, 1);
  eq('state Cancelled', State[(await getState(sq.squad)).state], 'Cancelled');
  eq('start after cancel reverts WrongState', (await revertName(sq.organizer, sq.squad, squadAbi, 'start')).name, 'WrongState');
  const started = await setup({ n: 3, c: C2, label: 's6b' });
  await start(started);
  eq('cancel after start reverts WrongState', (await revertName(started.organizer, started.squad, squadAbi, 'cancel')).name, 'WrongState');
  await balancesUnchanged(sq);
  await jarEmpty(sq);
});

// Settle at t = d1 + 3280 (round length 300): candidates roll to d1+3300 (20s lead < 150 = half a round),
// so one more round is added: d2 = d1 + 3600, opening at d1 + 3300 > t.
await scenario('7 Late settle', async () => {
  const sq = await setup({ n: 3, c: C2, label: 's7' });
  demoMembers.push(...sq.members);
  const o = await start(sq);
  const d1 = (await getState(sq.squad)).roundDeadline;
  await send(o[0], sq.squad, squadAbi, 'contribute');
  await send(o[1], sq.squad, squadAbi, 'contribute');
  const t = d1 + 3280n;
  await rpc('evm_setNextBlockTimestamp', [toHex(t)]);
  await send(o[1], sq.squad, squadAbi, 'settleRound', [1]);
  const s = await getState(sq.squad);
  eq('settled at t = d1 + 3280', (await now()), t);
  eq('round 2 deadline = d1 + 3600', s.roundDeadline, d1 + 3600n);
  check('round 2 deadline in the future, >= half a round away', s.roundDeadline - t >= 150n, `lead ${s.roundDeadline - t}s`);
  eq('deadline stays aligned to round 1 (mod 300)', (s.roundDeadline - d1) % 300n, 0n);
  eq('the late payer of round 1 now has debt c', s.owed[2], C2, fmt);
  const opensAt = s.roundDeadline - 300n;
  const rv = await revertName(o[0], sq.squad, squadAbi, 'contribute');
  check('contribute before opening reverts RoundNotOpen(opensAt)', rv.name === 'RoundNotOpen' && rv.args?.[0] === opensAt, `${rv.name}(${rv.args}) opensAt ${opensAt}`);
  eq('settleRound(2) reverts TooEarly', (await revertName(o[0], sq.squad, squadAbi, 'settleRound', [2])).name, 'TooEarly');
  eq('settleRound(1) again reverts AlreadySettled', (await revertName(o[0], sq.squad, squadAbi, 'settleRound', [1])).name, 'AlreadySettled');
  await warp(opensAt);
  await send(o[0], sq.squad, squadAbi, 'contribute');
  check('contribute works once the round opens', true);
});

// Weekly, 5 members, c = ₦1,000: countsForTrust. Score = onTime - 2*late - 10*missed + 3*completed.
// a=turn 1 pays round 2 late: (4,1,0,1) -> 5 Building. b=turn 5 misses round 3 (debt c, repaid from b's own
// payout in round 5): (4,0,1,0) -> -6 New. Others pay every round on time: (5,0,0,1) -> 8 Building.
await scenario('8 Trust score (Weekly, 5 members, c=₦1,000) + Demo writes nothing', async () => {
  const C1 = 1000n * E;
  const demoBefore = [];
  for (const m of demoMembers) demoBefore.push(await record(m));
  const sq = await setup({ n: 5, c: C1, period: 1, label: 's8' });
  for (const m of sq.members) {
    const rc = await record(m);
    check(`${m.slice(-4)} starts with an empty record`, !rc.onTime && !rc.late && !rc.missed && !rc.completed);
  }
  const o = await start(sq);
  eq('countsForTrust true', (await getState(sq.squad)).countsForTrust, true);
  const [a, b] = [o[0], o[4]];
  await playRound(sq, o);
  // round 2: everyone but a pays on time, then a pays after the deadline (within grace).
  let s = await getState(sq.squad);
  await warp(s.roundDeadline - WEEK);
  for (const m of o.slice(1)) await send(m, sq.squad, squadAbi, 'contribute');
  await warp(s.roundDeadline + 100n);
  const rl = await send(a, sq.squad, squadAbi, 'contribute');
  eq('a Contributed late=true', events(rl, 'Contributed')[0].late, true);
  await playRound(sq, o.filter((m) => m !== b)); // round 3: b misses
  s = await getState(sq.squad);
  eq('b owes c after missing round 3', s.owed[4], C1, fmt);
  await playRound(sq, o);
  const ev5 = await playRound(sq, o);
  eq('round 5: b gets 5c - c debt', ev5.amount, 4n * C1, fmt);
  eq('state Completed', State[(await getState(sq.squad)).state], 'Completed');
  await balancesUnchanged(sq);
  await jarEmpty(sq);
  const want = (m) => (m === a ? [4, 1, 0, 1, 5n, 1] : m === b ? [4, 0, 1, 0, -6n, 0] : [5, 0, 0, 1, 8n, 1]);
  for (const m of o) {
    const rc = await record(m);
    const score = await read(dep.registry, registryAbi, 'trustScore', [m]);
    const tier = await read(dep.registry, registryAbi, 'tier', [m]);
    const got = [rc.onTime, rc.late, rc.missed, rc.completed, score, tier];
    const tag = m === a ? 'a(late)' : m === b ? 'b(missed)' : m.slice(-4);
    check(`${tag} records/score/tier`, got.join() === want(m).join(), `got ${got.join()} want ${want(m).join()} (onTime,late,missed,completed,score,tier)`);
  }
  // Demo squads (scenarios 1 to 5 and 7, with misses and debt) never write trust.
  const demoAfter = [];
  for (const m of demoMembers) demoAfter.push(await record(m));
  const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
  check(`${demoMembers.length} Demo-squad members: records unchanged`, JSON.stringify(demoAfter, big) === JSON.stringify(demoBefore, big));
  check('Demo-squad members still all-zero', demoAfter.every((r) => !r.onTime && !r.late && !r.missed && !r.completed));
});

// firstDeadline F. start() at F + 2w + 1d -> rolls to F + 3w (6 days lead, >= half a round).
// start() at F + 2w + 5d -> F + 3w is only 2 days away (< 3.5d) -> one more round: F + 4w.
for (const [tag, lateBy, rounds] of [['9a', 2n * WEEK + DAY, 3n], ['9b', 2n * WEEK + 5n * DAY, 4n]]) {
  await scenario(`${tag} firstDeadline keeps weekday/hour after a late start (+${lateBy / DAY}d)`, async () => {
    const F = (await now()) + 3n * DAY + 4321n;
    const sq = await setup({ n: 3, c: C2, period: 1, firstDeadline: F, label: `s${tag}` });
    eq('firstDeadline stored', await read(sq.squad, squadAbi, 'firstDeadline'), F);
    await warp(F + lateBy);
    const r = await send(sq.organizer, sq.squad, squadAbi, 'start');
    const act = events(r, 'Activated')[0].roundDeadline;
    eq(`round 1 deadline = F + ${rounds} weeks`, act, F + rounds * WEEK);
    eq('whole rounds from anchor', (act - F) % WEEK, 0n);
    const [df, da] = [new Date(Number(F) * 1000), new Date(Number(act) * 1000)];
    check('same UTC weekday and time', df.getUTCDay() === da.getUTCDay() && df.toISOString().slice(11) === da.toISOString().slice(11), `${df.toISOString()} -> ${da.toISOString()}`);
    check('at least half a round of lead', act - (await now()) >= WEEK / 2n, `${(act - (await now())) / 3600n}h`);
  });
}

// payBack needs the same allowance as contribute(); a failed pay back keeps the debt.
await scenario('10 Pay back guards (NotMember, NothingOwed, allowance, PastGrace)', async () => {
  const sq = await setup({ n: 3, c: C2, label: 's10' });
  demoMembers.push(...sq.members);
  const o = await start(sq);
  const [stranger] = await makeMembers(1);
  eq('non-member payBack reverts NotMember', (await revertName(stranger, sq.squad, squadAbi, 'payBack')).name, 'NotMember');
  eq('payBack with no debt reverts NothingOwed', (await revertName(o[0], sq.squad, squadAbi, 'payBack')).name, 'NothingOwed');
  const z = o[2];
  await playRound(sq, [o[0], o[1]]); // z misses round 1 -> debt c
  await send(z, dep.token, tokenAbi, 'approve', [sq.squad, 0n]);
  eq('payBack without allowance reverts ERC20InsufficientAllowance', (await revertName(z, sq.squad, squadAbi, 'payBack')).name, 'ERC20InsufficientAllowance');
  let s = await getState(sq.squad);
  eq('debt kept', s.owed[2], C2, fmt);
  await send(z, dep.token, tokenAbi, 'approve', [sq.squad, maxUint256]);
  await send(z, sq.squad, squadAbi, 'payBack');
  s = await getState(sq.squad);
  eq('debt cleared after approving', s.owed[2], 0n, fmt);
  await warp(s.settleableAfter + 1n);
  eq('contribute after deadline + grace reverts PastGrace', (await revertName(z, sq.squad, squadAbi, 'contribute')).name, 'PastGrace');
});

// ---------- summary ----------
console.log('\n Scenario                                                                   Result  Checks');
let failed = 0;
for (const r of results) {
  const pass = r.checks.filter((c) => c.ok).length;
  const ok = !r.error && pass === r.checks.length && r.checks.length > 0;
  if (!ok) failed++;
  console.log(` ${r.name.padEnd(74)} ${ok ? 'PASS' : 'FAIL'}    ${pass}/${r.checks.length}${r.error ? ' (threw)' : ''}`);
}
const over = gasLog.filter((g) => g.used > g.est);
if (gasLog.length) console.log(`\nstart() gas: ${over.length}/${gasLog.length} used more than estimated; worst used/estimate = ${Math.max(...gasLog.map((g) => Number(g.used) / Number(g.est))).toFixed(3)}`);
console.log(`${results.length - failed}/${results.length} scenarios passed (chain ${chainId}, factory ${dep.factory})`);
process.exit(failed ? 1 : 0);
