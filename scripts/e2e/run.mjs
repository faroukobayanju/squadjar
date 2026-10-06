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

// start() then returns turn order (members[0] = turn 1).
async function start(sq) {
  await send(sq.organizer, sq.squad, squadAbi, 'start');
  return (await getState(sq.squad)).members;
}
async function lockAll(sq, order, skip = []) {
  let r;
  for (const m of order) if (!skip.includes(m)) r = await send(m, sq.squad, squadAbi, 'lockDeposit');
  return r;
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

// Snapshot of registry records for every member of a Demo squad, compared in scenario 7.
const demoMembers = [];
const record = async (m) => {
  const [onTime, late, missed, completed] = await read(dep.registry, registryAbi, 'records', [m]);
  return { onTime, late, missed, completed };
};

// ================= scenarios =================
const C2 = 2000n * E;

await scenario('1 Happy path (Demo, 3 members, c=₦2,000)', async () => {
  const sq = await setup({ n: 3, c: C2, label: 's1' });
  demoMembers.push(...sq.members);
  const o = await start(sq);
  const reqs = (await getState(sq.squad)).required;
  check('required deposits 2c, c, c by turn', reqs.join() === [2n * C2, C2, C2].join(), reqs.map(fmt).join(' '));
  await lockAll(sq, o);
  eq('state Active after all locked', State[(await getState(sq.squad)).state], 'Active');
  for (let r = 1; r <= 3; r++) {
    const ev = await playRound(sq, o);
    eq(`round ${r} RoundSettled amount = 3c`, ev.amount, 3n * C2, fmt);
    eq(`round ${r} collector is turn ${r}`, ev.collector, o[r - 1]);
  }
  eq('state Completed', State[(await getState(sq.squad)).state], 'Completed');
  await balancesUnchanged(sq);
  await jarEmpty(sq);
});

await scenario('2 One miss (turn-1 collector skips round 2)', async () => {
  const sq = await setup({ n: 3, c: C2, label: 's2' });
  demoMembers.push(...sq.members);
  const o = await start(sq);
  await lockAll(sq, o);
  const x = o[0];
  await playRound(sq, o);
  const ev2 = await playRound(sq, [o[1], o[2]]);
  eq('round 2 collector (turn 2) still gets 3c', ev2.amount, 3n * C2, fmt);
  check('round 2 missed[] = [x]', ev2.missed.length === 1 && ev2.missed[0] === x, ev2.missed.join());
  const s = await getState(sq.squad);
  eq("x's deposit reduced by c (2c -> c)", s.locked[idx(s, x)], C2, fmt);
  eq('x missCount = 1', s.misses[idx(s, x)], 1);
  eq('x refillBy = 3', s.refillBy[idx(s, x)], 3);
  eq('x not stopped paying', s.stopped[idx(s, x)], false);
  // Round 3: x pays (one miss only, no refill). Measure x's end refund in the settling tx.
  await warp((await getState(sq.squad)).roundDeadline - 300n);
  await send(x, sq.squad, squadAbi, 'contribute');
  await send(o[1], sq.squad, squadAbi, 'contribute');
  const before = await bal(x);
  const r = await send(o[2], sq.squad, squadAbi, 'contribute');
  eq('round 3 collector gets 3c', events(r, 'RoundSettled')[0].amount, 3n * C2, fmt);
  eq("x's end refund = c (all-paid run refunds 2c: -c)", (await bal(x)) - before, C2, fmt);
  // The miss was paid from x's own deposit, so x's net is the same as in an all-paid run.
  await balancesUnchanged(sq);
  await jarEmpty(sq);
});

// Expected numbers (Squad.sol _settle/_stop/_finish), n=4, deposits by turn 3c 2c c c:
// 3a x=turn 1 collects r1 (4c), misses r2 (cover c from deposit -> 2c, refillBy 3), misses r3
//    without refilling -> StoppedPaying; coverPerRound = 2c/(4-3+1) = c; r3 cover c -> deposit c;
//    r4 cover c (last round) -> 0. Every collector gets 4c, refunds are each payer's deposit, nothing forfeit.
await scenario('3a Stopped paying after collecting (Demo, 4 members)', async () => {
  const sq = await setup({ n: 4, c: C2, label: 's3a' });
  demoMembers.push(...sq.members);
  const o = await start(sq);
  await lockAll(sq, o);
  const x = o[0];
  const rest = o.slice(1);
  eq('round 1: x collects 4c', (await playRound(sq, o)).amount, 4n * C2, fmt);
  eq('round 2 (x misses): turn 2 gets 4c', (await playRound(sq, rest)).amount, 4n * C2, fmt);
  let s = await getState(sq.squad);
  eq('after r2: x deposit 2c', s.locked[idx(s, x)], 2n * C2, fmt);
  const r3 = await playRound(sq, rest);
  const stopped = events(r3.receipt, 'StoppedPaying');
  check('round 3: StoppedPaying(x) emitted', stopped.length === 1 && stopped[0].member === x);
  eq('stoppedPaying(x) true', await read(sq.squad, squadAbi, 'stoppedPaying', [x]), true);
  eq('round 3: turn 3 gets 4c', r3.amount, 4n * C2, fmt);
  s = await getState(sq.squad);
  eq('activeCount = 3', s.activeCount, 3);
  eq('after r3: x deposit c', s.locked[idx(s, x)], C2, fmt);
  eq('coverPerRound(x) = c', await read(sq.squad, squadAbi, 'coverPerRound', [x]), C2, fmt);
  eq('x contribute reverts MemberStoppedPaying', (await revertName(x, sq.squad, squadAbi, 'contribute')).name, 'MemberStoppedPaying');
  const r4 = await playRound(sq, rest); // 3 payers == activeCount: auto-settles
  eq('round 4 auto-settles: turn 4 gets 4c', r4.amount, 4n * C2, fmt);
  check('round 4 missed[] lists x', r4.missed.includes(x));
  eq('state Completed', State[(await getState(sq.squad)).state], 'Completed');
  // net for everyone 0: x paid 3c deposit + c, collected 4c; payers got their deposits back.
  await balancesUnchanged(sq);
  await jarEmpty(sq);
});

// 3b y=turn 3, deposit c: misses r1 (cover c -> 0, refillBy 2), misses r2 -> StoppedPaying; jar fronts c
//    (owed c) so turn 2 still gets 4c; r3 is y's turn: jar fronts c more (owed 2c), payout 4c, repays 2c,
//    withholds c*(4-3)=c into y's deposit -> y receives c; r4 covers c from that deposit -> turn 4 gets 4c.
await scenario('3b Stopped paying before own turn (fronting, Demo, 4 members)', async () => {
  const sq = await setup({ n: 4, c: C2, label: 's3b' });
  demoMembers.push(...sq.members);
  const o = await start(sq);
  await lockAll(sq, o);
  const y = o[2];
  const rest = o.filter((m) => m !== y);
  eq('round 1 (y misses): turn 1 gets 4c', (await playRound(sq, rest)).amount, 4n * C2, fmt);
  const r2 = await playRound(sq, rest);
  check('round 2: StoppedPaying(y)', events(r2.receipt, 'StoppedPaying')[0]?.member === y);
  eq('round 2: turn 2 still gets 4c', r2.amount, 4n * C2, fmt);
  let s = await getState(sq.squad);
  eq('owed(y) = c (fronted)', s.owed[idx(s, y)], C2, fmt);
  const r3 = await playRound(sq, rest);
  eq('round 3 (y collects): net payout c (4c - 2c repay - c withheld)', r3.amount, C2, fmt);
  s = await getState(sq.squad);
  eq('owed(y) = 0 after repay', s.owed[idx(s, y)], 0n, fmt);
  eq('y deposit = c withheld', s.locked[idx(s, y)], C2, fmt);
  eq('round 4: turn 4 gets 4c', (await playRound(sq, rest)).amount, 4n * C2, fmt);
  eq('state Completed', State[(await getState(sq.squad)).state], 'Completed');
  await balancesUnchanged(sq);
  await jarEmpty(sq);
});

await scenario('4a Never locks deposit (4 -> 3 members, squad continues)', async () => {
  const sq = await setup({ n: 4, c: C2, label: 's4a' });
  const o = await start(sq);
  const x = o[3];
  await lockAll(sq, o, [x]); // turn 1..3 lock 3c, 2c, c
  eq('finalize before deadline reverts DepositWindowOpen', (await revertName(o[0], sq.squad, squadAbi, 'finalizeDeposits')).name, 'DepositWindowOpen');
  await warp((await getState(sq.squad)).depositDeadline + 1n);
  const r = await send(o[0], sq.squad, squadAbi, 'finalizeDeposits');
  check('Dropped(x) emitted', events(r, 'Dropped').some((e) => e.member === x));
  eq('isMember(x) false', await read(sq.squad, squadAbi, 'isMember', [x]), false);
  const s = await getState(sq.squad);
  eq('state Active', State[s.state], 'Active');
  eq('3 members kept in turn order', s.members.join(), o.slice(0, 3).join());
  check('required re-assigned 2c, c, c', s.required.join() === [2n * C2, C2, C2].join(), s.required.map(fmt).join(' '));
  eq('x balance unchanged', await bal(x), sq.start.get(x), fmt);
  eq('turn 1 excess refunded (holds start-2c)', await bal(o[0]), sq.start.get(o[0]) - 2n * C2, fmt);
  eq('turn 2 excess refunded (holds start-c)', await bal(o[1]), sq.start.get(o[1]) - C2, fmt);
  eq('turn 3 (holds start-c)', await bal(o[2]), sq.start.get(o[2]) - C2, fmt);
  eq('jar holds 4c', await bal(sq.squad), 4n * C2, fmt);
  eq('totalLocked = 4c', s.totalLocked, 4n * C2, fmt);
});

await scenario('4b Never locks deposit (3 -> 2 members, Cancelled)', async () => {
  const sq = await setup({ n: 3, c: C2, label: 's4b' });
  const o = await start(sq);
  const x = o[2];
  await lockAll(sq, o, [x]);
  await warp((await getState(sq.squad)).depositDeadline + 1n);
  const r = await send(o[0], sq.squad, squadAbi, 'finalizeDeposits');
  check('Dropped(x) and Cancelled emitted', events(r, 'Dropped').some((e) => e.member === x) && events(r, 'Cancelled').length === 1);
  eq('state Cancelled', State[(await getState(sq.squad)).state], 'Cancelled');
  await balancesUnchanged(sq);
  await jarEmpty(sq);
});

await scenario('5 Organizer cancels during Depositing', async () => {
  const sq = await setup({ n: 3, c: C2, label: 's5' });
  const o = await start(sq);
  await lockAll(sq, o, [o[2]]);
  check('jar holds locked deposits before cancel', (await bal(sq.squad)) > 0n);
  eq('non-organizer cancel reverts NotOrganizer', (await revertName(sq.members[1], sq.squad, squadAbi, 'cancel')).name, 'NotOrganizer');
  const r = await send(sq.organizer, sq.squad, squadAbi, 'cancel');
  eq('Cancelled emitted', events(r, 'Cancelled').length, 1);
  eq('state Cancelled', State[(await getState(sq.squad)).state], 'Cancelled');
  await balancesUnchanged(sq);
  await jarEmpty(sq);
});

// Settle at t = d1 + 3280 (round length 300): candidates roll to d1+3300 (20s lead < 150 = half a round),
// so one more round is added: d2 = d1 + 3600, opening at d1 + 3300 > t.
await scenario('6 Late settle', async () => {
  const sq = await setup({ n: 3, c: C2, label: 's6' });
  demoMembers.push(...sq.members);
  const o = await start(sq);
  await lockAll(sq, o);
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
  const opensAt = s.roundDeadline - 300n;
  const rv = await revertName(o[0], sq.squad, squadAbi, 'contribute');
  check('contribute before opening reverts RoundNotOpen(opensAt)', rv.name === 'RoundNotOpen' && rv.args?.[0] === opensAt, `${rv.name}(${rv.args}) opensAt ${opensAt}`);
  eq('settleRound(2) reverts TooEarly', (await revertName(o[0], sq.squad, squadAbi, 'settleRound', [2])).name, 'TooEarly');
  await warp(opensAt);
  await send(o[0], sq.squad, squadAbi, 'contribute');
  check('contribute works once the round opens', true);
});

// Weekly, 5 members, c = ₦1,000: countsForTrust. Score = onTime - 2*late - 10*missed + 3*completed.
// a=turn 1 pays round 2 late: (4,1,0,1) -> 5 Building. b=turn 5 misses round 3: (4,0,1,0) -> -6 New.
// Others pay every round on time: (5,0,0,1) -> 8 Building.
await scenario('7 Trust score (Weekly, 5 members, c=₦1,000) + Demo writes nothing', async () => {
  const C1 = 1000n * E;
  const demoBefore = [];
  for (const m of demoMembers) demoBefore.push(await record(m));
  const sq = await setup({ n: 5, c: C1, period: 1, label: 's7' });
  for (const m of sq.members) {
    const rc = await record(m);
    check(`${m.slice(-4)} starts with an empty record`, !rc.onTime && !rc.late && !rc.missed && !rc.completed);
  }
  const o = await start(sq);
  await lockAll(sq, o);
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
  await playRound(sq, o);
  await playRound(sq, o);
  eq('state Completed', State[(await getState(sq.squad)).state], 'Completed');
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
  // Demo squads (scenarios 1, 2, 3a, 3b, 6, with misses and stops) never write trust.
  const demoAfter = [];
  for (const m of demoMembers) demoAfter.push(await record(m));
  check(`${demoMembers.length} Demo-squad members: records unchanged`, JSON.stringify(demoAfter, (k, v) => (typeof v === 'bigint' ? `${v}` : v)) === JSON.stringify(demoBefore, (k, v) => (typeof v === 'bigint' ? `${v}` : v)));
  check('Demo-squad members still all-zero', demoAfter.every((r) => !r.onTime && !r.late && !r.missed && !r.completed));
});

// firstDeadline F. Activation at F + 2w + 1d -> rolls to F + 3w (6 days lead, >= half a round).
// Activation at F + 2w + 5d -> F + 3w is only 2 days away (< 3.5d) -> one more round: F + 4w.
for (const [tag, lateBy, rounds] of [['8a', 2n * WEEK + DAY, 3n], ['8b', 2n * WEEK + 5n * DAY, 4n]]) {
  await scenario(`${tag} firstDeadline keeps weekday/hour after late activation (+${lateBy / DAY}d)`, async () => {
    const F = (await now()) + 3n * DAY + 4321n;
    const sq = await setup({ n: 3, c: C2, period: 1, firstDeadline: F, label: `s${tag}` });
    eq('firstDeadline stored', await read(sq.squad, squadAbi, 'firstDeadline'), F);
    const o = await start(sq);
    await lockAll(sq, o, [o[2]]);
    await warp(F + lateBy);
    const r = await send(o[2], sq.squad, squadAbi, 'lockDeposit');
    const act = events(r, 'Activated')[0].roundDeadline;
    eq(`round 1 deadline = F + ${rounds} weeks`, act, F + rounds * WEEK);
    eq('whole rounds from anchor', (act - F) % WEEK, 0n);
    const [df, da] = [new Date(Number(F) * 1000), new Date(Number(act) * 1000)];
    check('same UTC weekday and time', df.getUTCDay() === da.getUTCDay() && df.toISOString().slice(11) === da.toISOString().slice(11), `${df.toISOString()} -> ${da.toISOString()}`);
    check('at least half a round of lead', act - (await now()) >= WEEK / 2n, `${(act - (await now())) / 3600n}h`);
  });
}

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
