/**
 * Smoke test: full Agent Jury lifecycle against a local Anvil chain.
 *
 * Spawns Anvil, deploys MockAgentID + the three protocol contracts with
 * short windows, then drives the SDK through:
 *   happy path (create -> accept -> submit -> approve -> withdraw)
 *   dispute path (raise -> match -> draw -> commit -> reveal -> finalize)
 * and asserts balances, claimables, votes and reputation records.
 *
 * Run: npm run smoke
 * Requires: anvil on PATH, Foundry build artifacts in ../out/.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  keccak256,
  parseEther,
  toHex,
} from "viem";
import type { Abi, Address, Hash } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import {
  AgentJuryClient,
  CasePhase,
  JobStatus,
  Outcome,
  VOTE_CLIENT,
  VOTE_WORKER,
  computeCommitment,
  randomSalt,
} from "../src/index.js";
import { JobEscrowAbi, JuryCourtAbi, ReputationRegistryAbi } from "../src/abi/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const ANVIL_PORT = 8545;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
/** Anvil's default mnemonic — test accounts only, never mainnet. */
const MNEMONIC =
  "test test test test test test test test test test test junk";

const FEE = parseEther("0.01");
const AMOUNT = parseEther("1");

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function loadArtifact(name: string): { abi: Abi; bytecode: { object: Hash } } {
  const paths = [
    join(ROOT, "out", `${name}.sol`, `${name}.json`),
    join(ROOT, "out", "AgentCourt.t.sol", `${name}.json`),
  ];
  for (const p of paths) {
    try {
      return JSON.parse(readFileSync(p, "utf8")) as {
        abi: Abi;
        bytecode: { object: Hash };
      };
    } catch {
      // try next path
    }
  }
  throw new Error(`artifact not found for ${name}`);
}

async function waitForRpc(url: string, tries = 40): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_blockNumber", params: [] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("anvil did not come up");
}

async function main(): Promise<void> {
  console.log("starting anvil...");
  const foundryAnvil = join(homedir(), ".foundry", "bin", "anvil");
  const anvilBin =
    process.env.ANVIL_BIN ??
    (existsSync(foundryAnvil) ? foundryAnvil : "anvil");
  const anvil: ChildProcess = spawn(
    anvilBin,
    ["--port", String(ANVIL_PORT), "--silent"],
    { stdio: "ignore" },
  );
  try {
    await waitForRpc(RPC_URL);

    const publicClient = createPublicClient({
      chain: foundry,
      transport: http(RPC_URL),
    });
    const testClient = createTestClient({
      chain: foundry,
      mode: "anvil",
      transport: http(RPC_URL),
    });

    const accounts = Array.from({ length: 10 }, (_, i) =>
      mnemonicToAccount(MNEMONIC, { addressIndex: i }),
    );
    const deployer = accounts[0]!;
    const clientAddr = accounts[0]!.address;
    const workerAddr = accounts[1]!.address;
    const jurorAddrs = accounts.slice(2, 9).map((a) => a.address);

    const deployerWallet = createWalletClient({
      account: deployer,
      chain: foundry,
      transport: http(RPC_URL),
    });

    async function deploy(
      name: string,
      abi: Abi,
      bytecode: Hash,
      args: readonly unknown[],
    ): Promise<Address> {
      const hash = await deployerWallet.deployContract({
        abi,
        args: args as never,
        bytecode,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (!receipt.contractAddress) throw new Error(`deploy ${name} failed`);
      return receipt.contractAddress;
    }

    console.log("deploying contracts...");
    const mockAgentId = await deploy(
      "MockAgentID",
      loadArtifact("MockAgentID").abi,
      loadArtifact("MockAgentID").bytecode.object,
      [],
    );
    const registry = await deploy(
      "ReputationRegistry",
      ReputationRegistryAbi,
      loadArtifact("ReputationRegistry").bytecode.object,
      [],
    );
    const escrow = await deploy(
      "JobEscrow",
      JobEscrowAbi,
      loadArtifact("JobEscrow").bytecode.object,
      [mockAgentId, registry, 60n, 60n],
    );
    const court = await deploy(
      "JuryCourt",
      JuryCourtAbi,
      loadArtifact("JuryCourt").bytecode.object,
      [mockAgentId, escrow, registry, FEE, 30n, 30n, 3600n],
    );

    // Wire escrow <-> court <-> registry (deployer only, one-time).
    const mockAbi = [
      {
        inputs: [{ name: "to", type: "address" }],
        name: "grant",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
    ] as const;
    const grant = (to: Address) =>
      deployerWallet.writeContract({
        abi: mockAbi,
        account: deployer,
        address: mockAgentId,
        args: [to],
        chain: foundry,
        functionName: "grant",
      });
    await deployerWallet.writeContract({
      abi: JobEscrowAbi,
      account: deployer,
      address: escrow,
      args: [court],
      chain: foundry,
      functionName: "setCourt",
    });
    await deployerWallet.writeContract({
      abi: ReputationRegistryAbi,
      account: deployer,
      address: registry,
      args: [escrow, court],
      chain: foundry,
      functionName: "initialize",
    });

    // Grant Agent IDs to the client, the worker and seven jurors.
    for (const a of [clientAddr, workerAddr, ...jurorAddrs]) {
      await grant(a);
    }

    const makeClient = (accountIndex: number): AgentJuryClient => {
      const account = accounts[accountIndex]!;
      const walletClient = createWalletClient({
        account,
        chain: foundry,
        transport: http(RPC_URL),
      });
      return new AgentJuryClient({
        agentIdAddress: mockAgentId,
        chainId: 31337,
        courtAddress: court,
        escrowAddress: escrow,
        publicClient,
        registryAddress: registry,
        rpcUrl: RPC_URL,
        walletClient,
      });
    };

    const sdkClient = makeClient(0);
    const sdkWorker = makeClient(1);
    const sdkJurors = jurorAddrs.map((_, i) => makeClient(2 + i));

    console.log("reads (no deployment yet needed beyond the local one)...");
    check("hasAgentID(client) is true", await sdkClient.hasAgentID(clientAddr));
    check("hasAgentID(worker) is true", await sdkClient.hasAgentID(workerAddr));
    check(
      "hasAgentID(outsider) is false",
      !(await sdkClient.hasAgentID(accounts[9]!.address)),
    );
    check("disputeFee is 0.01 ether", (await sdkClient.disputeFee()) === FEE);
    check("poolSize is 0 before joins", (await sdkClient.poolSize()) === 0n);
    check("jurySize is 5", (await sdkClient.jurySize()) === 5n);
    check("quorum is 3", (await sdkClient.quorum()) === 3n);

    // Jurors join the pool.
    for (const j of sdkJurors) {
      const h = await j.joinPool();
      await publicClient.waitForTransactionReceipt({ hash: h });
    }
    check("poolSize is 7 after joins", (await sdkClient.poolSize()) === 7n);

    // Helper: wait for a transaction to mine. writeContract returns the
    // hash once the tx is submitted, not once it is mined, so any read
    // that must see the write has to wait for the receipt first.
    const mined = (hash: Hash) =>
      publicClient.waitForTransactionReceipt({ hash });

    // ---- happy path -------------------------------------------------
    console.log("happy path: create -> accept -> submit -> approve -> withdraw...");
    const specHash = keccak256(toHex("build me a landing page"));
    const { jobId: job1 } = await sdkClient.createJob(
      AMOUNT,
      BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600),
      specHash,
    );
    check("job 1 created with id 1", job1 === 1n);
    const job1Before = await sdkClient.getJob(job1);
    check("job 1 status is Open", job1Before.status === JobStatus.Open);
    check("job 1 amount is 1 ether", job1Before.amount === AMOUNT);
    check("job 1 client is the client", job1Before.client === clientAddr);

    await mined(await sdkWorker.acceptJob(job1));
    check(
      "job 1 status is Accepted",
      (await sdkClient.getJob(job1)).status === JobStatus.Accepted,
    );
    await mined(await sdkWorker.submitWork(job1, keccak256(toHex("deliverable v1"))));
    check(
      "job 1 status is Submitted",
      (await sdkClient.getJob(job1)).status === JobStatus.Submitted,
    );
    await mined(await sdkClient.approveJob(job1));
    check(
      "job 1 status is Completed",
      (await sdkClient.getJob(job1)).status === JobStatus.Completed,
    );
    const workerBefore = await publicClient.getBalance({ address: workerAddr });
    await mined(await sdkWorker.withdrawEscrow());
    const workerAfter = await publicClient.getBalance({ address: workerAddr });
    check(
      "worker withdrew 1 ether (minus gas)",
      workerAfter > workerBefore && workerAfter - workerBefore <= AMOUNT,
      `before=${workerBefore} after=${workerAfter}`,
    );
    const rec1 = await sdkClient.getRecord(workerAddr);
    check("worker jobsCompleted is 1", rec1.jobsCompleted === 1);

    // ---- dispute path -----------------------------------------------
    console.log("dispute path: create -> dispute -> match -> draw -> vote -> finalize...");
    const { jobId: job2 } = await sdkClient.createJob(
      AMOUNT,
      BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600),
      keccak256(toHex("write a smart contract")),
    );
    await mined(await sdkWorker.acceptJob(job2));
    await mined(await sdkWorker.submitWork(job2, keccak256(toHex("deliverable v2"))));
    await mined(
      await sdkClient.raiseDispute(job2, keccak256(toHex("evidence: code is broken"))),
    );
    check(
      "job 2 status is Disputed",
      (await sdkClient.getJob(job2)).status === JobStatus.Disputed,
    );
    await mined(await sdkWorker.matchDispute(job2));
    check(
      "job 2 status is Arbitration",
      (await sdkClient.getJob(job2)).status === JobStatus.Arbitration,
    );

    // The draw needs block.number > drawBlock (activation block + 1),
    // so mine two blocks first (same as the Foundry test's vm.roll +2).
    await testClient.mine({ blocks: 2 });
    await mined(await sdkClient.drawJurors(job2));
    const jurors = await sdkClient.getJurors(job2);
    check("5 jurors drawn", jurors.length === 5);
    check(
      "parties are not jurors",
      !jurors.includes(clientAddr) && !jurors.includes(workerAddr),
    );
    check(
      "no duplicate jurors",
      new Set(jurors).size === 5,
    );
    const caseBefore = await sdkClient.getCase(job2);
    check("case phase is Voting", caseBefore.phase === CasePhase.Voting);

    // 3 jurors vote worker (2), 2 vote client (1).
    const votes: { sdk: AgentJuryClient; vote: 1 | 2; salt: Hash }[] = [];
    for (let i = 0; i < jurors.length; i++) {
      const jurorAddr = jurors[i]!;
      const idx = jurorAddrs.indexOf(jurorAddr);
      const sdk = sdkJurors[idx]!;
      const vote = (i < 3 ? VOTE_WORKER : VOTE_CLIENT) as 1 | 2;
      const salt = randomSalt();
      votes.push({ sdk, vote, salt });
      const commitHash = await sdk.commitVote(job2, vote, salt);
      // Wait for the commit to mine before reading it back.
      await publicClient.waitForTransactionReceipt({ hash: commitHash });
      const stored = await sdkClient.getCommitment(job2, jurorAddr);
      check(
        `juror ${i} commitment matches computeCommitment`,
        stored === computeCommitment(job2, jurorAddr, vote, salt),
      );
    }

    // Move past the commit window, then reveal.
    await testClient.increaseTime({ seconds: 31 });
    await testClient.mine({ blocks: 1 });
    for (const { sdk, vote, salt } of votes) {
      await mined(await sdk.revealVote(job2, vote, salt));
    }
    const caseAfterReveal = await sdkClient.getCase(job2);
    check("5 votes revealed", caseAfterReveal.revealed === 5);
    check("3 worker votes", caseAfterReveal.workerVotes === 3);
    check("2 client votes", caseAfterReveal.clientVotes === 2);

    // waitForFinalized in the background, then finalize.
    const waitPromise = sdkClient.waitForFinalized(job2, {
      fromBlock: 0n,
      pollIntervalMs: 200,
      timeoutMs: 30_000,
    });
    await sdkClient.finalize(job2);
    const final = await waitPromise;
    check("case phase is Finalized", final.phase === CasePhase.Finalized);
    check("outcome is WorkerWins", final.outcome === Outcome.WorkerWins);
    check(
      "job 2 status is Resolved",
      (await sdkClient.getJob(job2)).status === JobStatus.Resolved,
    );

    // Worker gets the escrow; majority jurors split the client's fee.
    check(
      "worker claimable in escrow is 1 ether",
      (await sdkClient.claimableEscrow(workerAddr)) === AMOUNT,
    );
    const share = FEE / 3n;
    const majorityJuror = jurors[0]!;
    check(
      "majority juror claimable in court is fee/3",
      (await sdkClient.claimableCourt(majorityJuror)) === share,
    );
    const minorityJuror = jurors[3]!;
    check(
      "minority juror claimable in court is 0",
      (await sdkClient.claimableCourt(minorityJuror)) === 0n,
    );
    const recJuror = await sdkClient.getRecord(majorityJuror);
    check("majority juror casesJudged is 1", recJuror.casesJudged === 1);
    check("majority juror majorityVotes is 1", recJuror.majorityVotes === 1);
    const recWorker = await sdkClient.getRecord(workerAddr);
    check("worker disputesWon is 1", recWorker.disputesWon === 1);
    const recClient = await sdkClient.getRecord(clientAddr);
    check("client disputesLost is 1", recClient.disputesLost === 1);

    await mined(await sdkWorker.withdrawEscrow());
    check(
      "worker escrow claimable is 0 after withdraw",
      (await sdkClient.claimableEscrow(workerAddr)) === 0n,
    );
    // Withdraw as the actual majority juror (the first drawn juror),
    // not as sdkJurors[0] — the drawn order is random.
    const majoritySdk = sdkJurors[jurorAddrs.indexOf(majorityJuror)]!;
    await mined(await majoritySdk.withdrawCourt());
    check(
      "juror court claimable is 0 after withdraw",
      (await sdkClient.claimableCourt(majorityJuror)) === 0n,
    );

    console.log(`\n${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    anvil.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
