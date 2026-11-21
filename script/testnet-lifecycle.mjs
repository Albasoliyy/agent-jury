// Agent Jury testnet lifecycle runner (Node + ethers).
// TESTNET ONLY. Uses the fresh testnet-only wallets in
// ~/workspace/agent-jury/.testnet-wallets.json — never mainnet keys.
//
// Usage:
//   node script/testnet-lifecycle.mjs setup    # fund wallets, mint mock IDs, jurors join pool
//   node script/testnet-lifecycle.mjs phase1   # job -> dispute -> draw -> commit (5 jurors)
//   node script/testnet-lifecycle.mjs phase2   # reveal -> finalize -> withdraw (run AFTER commitEnd)
//   node script/testnet-lifecycle.mjs status   # read-only state summary
//
// Contract addresses come from .testnet-deploy.json (written by hand from
// the forge deploy output, or by `node script/testnet-lifecycle.mjs record`
// after pasting them). Intermediate state (jobId, jurors, votes, salts)
// lives in .testnet-lifecycle-state.json (mode 600, gitignored).
import { ethers } from "/home/hatch/workspace/ethers-check/node_modules/ethers/lib.esm/index.js";
import { readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";

const DIR = "/home/hatch/workspace/agent-jury";
const RPCS = [
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
  "https://bsc-testnet.publicnode.com",
];
const WALLETS_FILE = `${DIR}/.testnet-wallets.json`;
const DEPLOY_FILE = `${DIR}/.testnet-deploy.json`;
const STATE_FILE = `${DIR}/.testnet-lifecycle-state.json`;

const provider = new ethers.JsonRpcProvider(RPCS[0]);
function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}
function artifact(name) {
  return loadJson(`${DIR}/out/${name}.sol/${name}.json`).abi;
}
const wallets = loadJson(WALLETS_FILE);
function wallet(role) {
  return new ethers.Wallet(wallets[role].privateKey, provider);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitTx(p, label) {
  const rc = await p.wait();
  console.log(`  ${label}: ${rc.hash} (block ${rc.blockNumber}, status ${rc.status})`);
  if (rc.status !== 1) throw new Error(`${label} FAILED: ${rc.hash}`);
  return rc;
}
function loadState() {
  return existsSync(STATE_FILE) ? loadJson(STATE_FILE) : {};
}
function saveState(s) {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");
  chmodSync(STATE_FILE, 0o600);
}
function contracts() {
  const d = loadJson(DEPLOY_FILE);
  const deployer = wallet("deployer");
  return {
    d,
    mock: new ethers.Contract(d.mock, artifact("MockAgentID"), deployer),
    escrow: new ethers.Contract(d.escrow, artifact("JobEscrow"), deployer),
    court: new ethers.Contract(d.court, artifact("JuryCourt"), deployer),
    registry: new ethers.Contract(d.registry, artifact("ReputationRegistry"), deployer),
  };
}
const VOTE_CLIENT = 1;
const VOTE_WORKER = 2;

async function setup() {
  const { mock, court } = contracts();
  const deployer = wallet("deployer");
  const bal = await provider.getBalance(deployer.address);
  console.log("deployer", deployer.address, "balance", ethers.formatEther(bal), "tBNB");
  if (bal < ethers.parseEther("0.05")) throw new Error("deployer needs >= 0.05 tBNB — claim from the faucet first");

  // Fund the actors (gas + job value + fees).
  const funds = [
    ["client", "0.02"],
    ["worker", "0.005"],
    ...Array.from({ length: 7 }, (_, i) => [`juror${i}`, "0.003"]),
  ];
  for (const [role, amt] of funds) {
    const to = wallets[role].address;
    const b = await provider.getBalance(to);
    if (b >= ethers.parseEther(amt)) {
      console.log(`  ${role} already funded (${ethers.formatEther(b)}) — skipping`);
      continue;
    }
    await waitTx(await deployer.sendTransaction({ to, value: ethers.parseEther(amt) }), `fund ${role} ${amt}`);
  }

  // Mint one mock Agent ID to client, worker and each juror (open mint).
  for (const role of ["client", "worker", ...Array.from({ length: 7 }, (_, i) => `juror${i}`)]) {
    const addr = wallets[role].address;
    if ((await mock.balanceOf(addr)) > 0n) {
      console.log(`  ${role} already holds a mock Agent ID — skipping`);
      continue;
    }
    await waitTx(await mock.mint(addr), `mint mock ID -> ${role}`);
  }

  // Jurors join the pool.
  for (let i = 0; i < 7; i++) {
    const j = wallet(`juror${i}`).connect(provider);
    const c = court.connect(j);
    if ((await c.poolIndex(j.address)) !== 0n) {
      console.log(`  juror${i} already in pool — skipping`);
      continue;
    }
    await waitTx(await c.joinPool(), `juror${i} joinPool`);
  }
  console.log("pool size:", await court.poolSize());
  console.log("setup done.");
}

async function phase1() {
  const { d, escrow, court } = contracts();
  const client = wallet("client");
  const worker = wallet("worker");
  const fee = await court.disputeFee();
  console.log("disputeFee:", fee.toString(), "wei");
  const amount = ethers.parseEther("0.01");
  const now = Math.floor(Date.now() / 1000);
  const workDeadline = now + 7 * 24 * 3600;
  const specHash = ethers.keccak256(ethers.toUtf8Bytes("agent-jury demo spec"));
  const deliverableHash = ethers.keccak256(ethers.toUtf8Bytes("agent-jury demo deliverable"));
  const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("agent-jury demo evidence"));

  const escrowC = escrow.connect(client);
  const jobId = await escrowC.createJob.staticCall(amount, workDeadline, specHash, { value: amount });
  await waitTx(await escrowC.createJob(amount, workDeadline, specHash, { value: amount }), `createJob #${jobId}`);
  await waitTx(await escrow.connect(worker).acceptJob(jobId), "acceptJob");
  await waitTx(await escrow.connect(worker).submitWork(jobId, deliverableHash), "submitWork");
  await waitTx(
    await escrowC.raiseDispute(jobId, evidenceHash, { value: fee }),
    "raiseDispute (client fee)"
  );
  await waitTx(
    await escrow.connect(worker).matchDispute(jobId, { value: fee }),
    "matchDispute (worker fee)"
  );

  // Draw: needs block.number > drawBlock (activation block + 1). Retry on restart.
  const coder = ethers.AbiCoder.defaultAbiCoder();
  let drawn = null;
  for (let attempt = 1; attempt <= 8; attempt++) {
    const c = await court.cases(jobId);
    if (Number(c.phase) === 3) {
      drawn = await court.jurorsOf(jobId);
      break;
    }
    // Wait until past drawBlock, then call.
    let bn = await provider.getBlockNumber();
    while (bn <= Number(c.drawBlock)) {
      await sleep(3000);
      bn = await provider.getBlockNumber();
    }
    const tx = await court.drawJurors(jobId);
    const rc = await tx.wait();
    console.log(`  drawJurors attempt ${attempt}: ${rc.hash} (status ${rc.status})`);
    if (rc.status !== 1) throw new Error("drawJurors reverted");
    await sleep(3000);
  }
  if (!drawn || drawn.length !== 5) throw new Error(`draw failed: ${drawn ? drawn.length : 0} jurors`);
  console.log("jurors drawn:", drawn);

  const c = await court.cases(jobId);
  const commitEnd = Number(c.commitEnd);
  const revealEnd = Number(c.revealEnd);
  console.log("commitEnd:", new Date(commitEnd * 1000).toISOString());
  console.log("revealEnd:", new Date(revealEnd * 1000).toISOString());

  // Votes: first 3 jurors vote CLIENT, last 2 vote WORKER -> 3-2 ClientWins.
  const votes = {};
  const salts = {};
  for (let i = 0; i < drawn.length; i++) {
    const juror = drawn[i];
    const vote = i < 3 ? VOTE_CLIENT : VOTE_WORKER;
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const commitment = ethers.keccak256(
      coder.encode(["uint256", "address", "uint8", "bytes32"], [jobId, juror, vote, salt])
    );
    const role = Object.keys(wallets).find((r) => wallets[r].address.toLowerCase() === juror.toLowerCase());
    if (!role) throw new Error(`drawn juror ${juror} is not one of our test wallets`);
    votes[juror] = vote;
    salts[juror] = salt;
    await waitTx(await court.connect(wallet(role)).commitVote(jobId, commitment), `commitVote ${role} (vote ${vote})`);
  }
  saveState({ jobId: jobId.toString(), jurors: drawn, votes, salts, commitEnd, revealEnd, amount: amount.toString(), fee: fee.toString(), deploy: d });
  console.log("phase1 done. Reveals open at", new Date(commitEnd * 1000).toISOString());
  console.log("Run phase2 AFTER that time and BEFORE", new Date(revealEnd * 1000).toISOString());
}

async function phase2() {
  const { escrow, court } = contracts();
  const s = loadState();
  if (!s.jobId) throw new Error("no phase1 state — run phase1 first");
  const jobId = BigInt(s.jobId);
  const now = Math.floor(Date.now() / 1000);
  if (now <= s.commitEnd) throw new Error(`too early: reveals open at ${new Date(s.commitEnd * 1000).toISOString()}`);
  if (now > s.revealEnd) throw new Error(`too late: reveal window closed at ${new Date(s.revealEnd * 1000).toISOString()}`);

  for (const juror of s.jurors) {
    const role = Object.keys(wallets).find((r) => wallets[r].address.toLowerCase() === juror.toLowerCase());
    await waitTx(
      await court.connect(wallet(role)).revealVote(jobId, s.votes[juror], s.salts[juror]),
      `revealVote ${role} (vote ${s.votes[juror]})`
    );
  }
  await waitTx(await court.finalize(jobId), "finalize");
  const c = await court.cases(jobId);
  console.log("case phase (4=Finalized):", Number(c.phase), "| clientVotes:", Number(c.clientVotes), "| workerVotes:", Number(c.workerVotes));
  const j = await escrow.jobs(jobId);
  console.log("job status (7=Resolved):", Number(j.status));

  // Withdraws: client (escrow job amount + court fee refund), majority jurors (court fee share).
  const escrowC = escrow.connect(wallet("client"));
  const clientClaim = await escrow.claimable(wallets.client.address);
  if (clientClaim > 0n) await waitTx(await escrowC.withdraw(), `client escrow withdraw ${ethers.formatEther(clientClaim)}`);
  const courtC = court.connect(wallet("client"));
  const clientFee = await court.claimable(wallets.client.address);
  if (clientFee > 0n) await waitTx(await courtC.withdraw(), `client court withdraw ${ethers.formatEther(clientFee)}`);
  for (const juror of s.jurors) {
    if (s.votes[juror] !== VOTE_CLIENT) continue; // only majority jurors earned a share
    const role = Object.keys(wallets).find((r) => wallets[r].address.toLowerCase() === juror.toLowerCase());
    const claim = await court.claimable(juror);
    if (claim > 0n) await waitTx(await court.connect(wallet(role)).withdraw(), `${role} court withdraw ${ethers.formatEther(claim)}`);
  }
  console.log("phase2 done. Full lifecycle complete on testnet.");
}

async function status() {
  const { d, mock, escrow, court, registry } = contracts();
  console.log("deploy:", d);
  const s = loadState();
  console.log("lifecycle state:", s.jobId ? `job #${s.jobId}` : "(no job yet)");
  console.log("pool size:", await court.poolSize());
  if (s.jobId) {
    const jobId = BigInt(s.jobId);
    const j = await escrow.jobs(jobId);
    const c = await court.cases(jobId);
    console.log("job status:", Number(j.status), "| case phase:", Number(c.phase));
    console.log("clientVotes:", Number(c.clientVotes), "workerVotes:", Number(c.workerVotes), "revealed:", Number(c.revealed));
    console.log("commitEnd:", new Date(Number(c.commitEnd) * 1000).toISOString());
    console.log("revealEnd:", new Date(Number(c.revealEnd) * 1000).toISOString());
  }
  for (const role of ["client", "worker", ...Array.from({ length: 7 }, (_, i) => `juror${i}`)]) {
    const addr = wallets[role].address;
    console.log(`${role.padEnd(8)} mockID=${await mock.balanceOf(addr)} balance=${ethers.formatEther(await provider.getBalance(addr))}`);
  }
}

const cmd = process.argv[2];
if (cmd === "setup") await setup();
else if (cmd === "phase1") await phase1();
else if (cmd === "phase2") await phase2();
else if (cmd === "status") await status();
else {
  console.error("usage: node script/testnet-lifecycle.mjs <setup|phase1|phase2|status>");
  process.exit(1);
}
