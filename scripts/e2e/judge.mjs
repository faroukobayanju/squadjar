// Drives app/lib/judge-plan.ts against an anvil fork: bots Ada and Tunde keep a demo squad open, a judge joins,
// and the squad plays to Completed while a fresh demo squad opens. Each loop = one cron run, then 60s pass.
// Usage: scripts/e2e/judge.sh   (or: RPC_URL=http://127.0.0.1:8547 node scripts/e2e/judge.mjs with anvil already forking)
// The send/approve steps mirror app/lib/judge.ts; the DB side (squads, judge_squads, users) is not exercised here.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const viemDir = process.env.VIEM_DIR ?? join(root, 'app', 'node_modules', 'viem');
const { createPublicClient, createWalletClient, http, defineChain, parseEventLogs, keccak256, toHex, encodeAbiParameters, maxUint256, getAddress } =
  await import(pathToFileURL(join(viemDir, '_esm', 'index.js')).href);
const { planJudgeStep, needsNextSquad, hasSeat } = await import(pathToFileURL(join(root, 'app', 'lib', 'judge-plan.ts')).href);

const RPC = process.env.RPC_URL ?? 'http://127.0.0.1:8547';
const abi = (n) => JSON.parse(readFileSync(join(root, 'contracts', 'abi', `${n}.json`), 'utf8'));
const tokenAbi = abi('AjoNGN');
const errorsOf = (a) => a.filter((x) => x.type === 'error');
const squadAbi = [...abi('Squad'), ...errorsOf(tokenAbi)];
const factoryAbi = abi('SquadFactory');
const pub0 = createPublicClient({ transport: http(RPC) });
const chainId = await pub0.getChainId();
const dep = JSON.parse(readFileSync(join(root, 'contracts', 'deployments', `${chainId}.json`), 'utf8'));
const chain = defineChain({ id: chainId, name: 'fork', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC), pollingInterval: 20 });
const wallet = createWalletClient({ chain, transport: http(RPC), pollingInterval: 20 });
const rpc = (method, params = []) => pub.request({ method, params });
const E = 10n ** 18n;
const now = async () => (await pub.getBlock()).timestamp;
const tick = async (s) => {
  await rpc('evm_setNextBlockTimestamp', [toHex((await now()) + BigInt(s))]);
  await rpc('evm_mine');
};

async function send(from, address, abi_, functionName, args = []) {
  const req = { account: from, address, abi: abi_, functionName, args, chain };
  await pub.simulateContract(req);
  const est = await pub.estimateContractGas(req);
  const hash = await wallet.writeContract({ ...req, gas: (est * 3n) / 2n });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${functionName} reverted`);
  return r;
}
const bal = (a) => pub.readContract({ address: dep.token, abi: tokenAbi, functionName: 'balanceOf', args: [a] });
const view = (s) => pub.readContract({ address: s, abi: squadAbi, functionName: 'getState' });
async function approveIfNeeded(from, squad, amount) {
  const a = await pub.readContract({ address: dep.token, abi: tokenAbi, functionName: 'allowance', args: [from, squad] });
  if (a < amount) await send(from, dep.token, tokenAbi, 'approve', [squad, maxUint256]);
}

const salt = (Date.now() % 0xffffffff).toString(16).padStart(8, '0');
const [ADA, TUNDE, JUDGE] = await Promise.all(
  [1, 2, 3].map(async (i) => {
    const a = getAddress(`0x00000000000000000000000000ad${salt}${i.toString(16).padStart(4, '0')}`);
    await rpc('anvil_impersonateAccount', [a]);
    await rpc('anvil_setBalance', [a, toHex(1000n * E)]);
    return a;
  }),
);
const bots = [ADA, TUNDE];
const NAMES = ['Ada', 'Tunde'];
await send(JUDGE, dep.token, tokenAbi, 'faucet', [20_000n * E]);

// The cron's squad list (judge_squads rows: address + invite code + done).
const squads = [];
async function cronRun() {
  const log = [];
  for (const b of [0, 1]) if ((await bal(bots[b])) < 20_000n * E) (await send(bots[b], dep.token, tokenAbi, 'faucet', [100_000n * E]), log.push(`${NAMES[b]} faucet`));
  const t = await now();
  const views = [];
  for (const row of squads.filter((r) => !r.done)) {
    const v = await view(row.address);
    views.push(v);
    const step = planJudgeStep(v, bots, t);
    if (!step) continue;
    if (step.kind === 'finished') {
      row.done = true;
      log.push(`#${row.n} finished`);
      continue;
    }
    const from = bots[step.bot];
    if (step.approve > 0n) await approveIfNeeded(from, row.address, step.approve);
    await send(from, row.address, squadAbi, step.fn, step.fn === 'join' ? [row.code] : []);
    log.push(`#${row.n} ${NAMES[step.bot]} ${step.fn}`);
  }
  if (needsNextSquad(views)) {
    const code = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const r = await send(ADA, dep.factory, factoryAbi, 'createSquad', [2000n * E, 3, 0, keccak256(encodeAbiParameters([{ type: 'bytes32' }], [code])), 0n]);
    const address = parseEventLogs({ abi: factoryAbi, logs: r.logs, eventName: 'SquadCreated' })[0].args.squad;
    squads.push({ n: squads.length + 1, address, code, done: false });
    log.push(`#${squads.length} Ada create`);
  }
  return log;
}
// What /api/judge hands out: the oldest unfinished squad with a free seat.
async function current() {
  for (const row of squads.filter((r) => !r.done)) if (hasSeat(await view(row.address))) return row;
  return null;
}

const judgeStart = await bal(JUDGE);
let joined = null;
let paidRounds = 0;
for (let run = 1; run <= 40; run++) {
  const log = await cronRun();
  // The judge: joins the handed-out squad, locks when asked, pays each round as soon as it opens.
  if (!joined) {
    const row = await current();
    if (row && (await view(row.address)).members.length === 2) {
      await send(JUDGE, row.address, squadAbi, 'join', [row.code]);
      joined = row;
      log.push(`judge joins #${row.n}`);
    }
  } else {
    const v = await view(joined.address);
    const i = v.members.indexOf(JUDGE);
    if (v.state === 1 && v.locked[i] < v.required[i]) {
      await approveIfNeeded(JUDGE, joined.address, v.required[i]);
      await send(JUDGE, joined.address, squadAbi, 'lockDeposit');
      log.push('judge locks');
    } else if (v.state === 2 && !v.paidThisRound[i] && (await now()) >= v.roundDeadline - BigInt(v.roundLength)) {
      await approveIfNeeded(JUDGE, joined.address, v.contribution);
      await send(JUDGE, joined.address, squadAbi, 'contribute');
      paidRounds++;
      log.push(`judge pays round ${v.currentRound}`);
    }
  }
  console.log(`run ${run}: ${log.join(', ') || '-'}`);
  if (joined?.done) break;
  await tick(60);
}

assert.ok(joined, 'judge joined a demo squad');
const final = await view(joined.address);
assert.equal(final.state, 3, 'demo squad completed');
assert.equal(joined.done, true, 'finished squad marked done');
assert.equal(paidRounds, 3, 'judge paid 3 rounds');
assert.equal(await bal(JUDGE), judgeStart, 'judge ends level: paid 3 x 2,000, collected 6,000, deposit back');
const next = await current();
assert.ok(next && next !== joined, 'a fresh demo squad has a free seat');
const nv = await view(next.address);
assert.deepEqual(nv.members, [ADA, TUNDE], 'fresh squad has Ada and Tunde');
assert.equal(squads.filter((r) => !r.done).length, 1, 'only one open demo squad left');
console.log('judge e2e ok');
