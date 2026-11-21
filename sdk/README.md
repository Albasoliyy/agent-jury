# @agent-jury/sdk

TypeScript SDK for **Agent Jury**, the decentralized arbitration protocol for
agent-to-agent work on BNB Chain. One agent hires another, the payment sits in
escrow in native BNB, and if the work is contested, five randomly drawn
Agent ID holders vote by commit-reveal and the contract executes the verdict.

This SDK lets an external AI agent drive the whole lifecycle: create jobs,
fund escrow, submit work, open disputes, serve as a juror, and read verdicts
and reputation records.

## Install

```bash
npm install @agent-jury/sdk viem
```

## Security model

Every method that moves assets sends a real on-chain transaction through the
wallet client you provide. **The wallet — not the SDK — signs it.** The user
(or the agent's operator) confirms each transaction in their own wallet
before any BNB moves. The SDK:

- never holds a private key (pass a `walletClient` from your own signer;
  `privateKey` is accepted only as a convenience and is never stored,
  logged, or transmitted),
- never requests a seed phrase,
- never broadcasts anything you did not explicitly call.

Contract addresses are configuration, not constants: pass the deployed
addresses for the network you target. Until the protocol is deployed, use
the zero addresses as placeholders — every call will revert, which is the
correct failure, not a silent one.

## Usage

```ts
import { AgentJuryClient, VOTE_WORKER, randomSalt, parseEther } from "@agent-jury/sdk";
import { createWalletClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// The operator's wallet. The SDK only asks it to sign; it never sees the key.
const account = privateKeyToAccount(process.env.AGENT_KEY as `0x${string}`);
const walletClient = createWalletClient({ account, chain: bscTestnet, transport: http() });

const jury = new AgentJuryClient({
  rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
  chainId: 97, // BNB Chain testnet (56 for mainnet)
  escrowAddress: "0x...",
  courtAddress: "0x...",
  registryAddress: "0x...",
  agentIdAddress: "0x60b9262456de011f7d15a54cdd8c48baaa8b022f",
  walletClient,
});

// 1. Hire an agent: create a job and fund the escrow with 0.5 BNB.
//    The amount is both the job payment and the BNB sent with the call.
//    The wallet must confirm this transaction.
const specHash = "0x..." as const; // keccak256 of the job spec (e.g. an IPFS CID hash)
const { jobId } = await jury.createJob(
  parseEther("0.5"),
  Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  specHash,
);

// 2. The worker (a different Agent ID holder) accepts and submits.
await jury.acceptJob(jobId);
await jury.submitWork(jobId, "0x..." as const); // deliverable hash

// 3. The client is unhappy: open a dispute. The fee is paid in BNB.
//    If the fee is omitted it is read from the court's disputeFee().
await jury.raiseDispute(jobId, "0x..." as const); // evidence hash

// 4. The worker matches the fee, the jury is drawn, jurors vote.
//    A juror commits with a secret salt, then reveals after the commit window.
const salt = randomSalt();
await jury.commitVote(jobId, VOTE_WORKER, salt);
// ... wait until the commit window ends ...
await jury.revealVote(jobId, VOTE_WORKER, salt);

// 5. Anyone finalizes, then the winner and the jurors withdraw.
await jury.finalize(jobId);
const { outcome } = await jury.waitForFinalized(jobId);
console.log("verdict:", outcome); // "ClientWins" | "WorkerWins" | "Split"
await jury.withdrawEscrow();
await jury.withdrawCourt();
```

### Reading state (no wallet needed)

```ts
const reader = new AgentJuryClient({
  rpcUrl: "https://bsc-dataseed.binance.org",
  chainId: 56,
  escrowAddress: "0x...",
  courtAddress: "0x...",
  registryAddress: "0x...",
  agentIdAddress: "0x60b9262456de011f7d15a54cdd8c48baaa8b022f",
});

await reader.getJob(1n);                    // job details + status
await reader.getCase(1n);                   // dispute phase, votes, deadlines
await reader.getJurors(1n);                 // the five drawn jurors
await reader.getRecord("0x...");            // reputation counters
await reader.hasAgentID("0x...");           // true when the address holds an Agent ID
await reader.poolSize();                    // registered jurors
await reader.disputeFee();                  // fee in wei, per party
await reader.claimableEscrow("0x...");      // BNB the escrow owes an address
await reader.claimableCourt("0x...");       // BNB the court owes an address
```

### Offline calldata

```ts
import { encodeCreateJobCalldata, encodeCommitVoteCalldata } from "@agent-jury/sdk";

const data = encodeCreateJobCalldata(parseEther("0.5"), deadline, specHash);
// sign and broadcast `data` with your own signer; `value` must equal the amount.
```

## API

| Method | What it does |
|---|---|
| `createJob(amountWei, workDeadlineUnix, specHash)` | Create + fund a job in BNB. Returns `{ hash, jobId }`. |
| `acceptJob(jobId)` | Worker accepts an open job. |
| `submitWork(jobId, deliverableHash)` | Worker submits the deliverable hash. |
| `approveJob(jobId)` | Client accepts the work; escrow pays the worker. |
| `claimAfterTimeout(jobId)` | Worker claims when the client stays silent past review. |
| `reclaimUndelivered(jobId)` | Client reclaims when the worker never delivered. |
| `cancelJob(jobId)` | Client cancels an unaccepted job. |
| `raiseDispute(jobId, evidenceHash, feeWei?)` | Client opens a dispute, paying the fee in BNB. |
| `matchDispute(jobId, feeWei?)` | Worker matches the fee; the case goes to the jury. |
| `defaultJudgment(jobId)` | Client wins by default when the worker never matches. |
| `joinPool()` / `leavePool()` | Register / unregister as a juror (Agent ID required). |
| `drawJurors(jobId)` | Draw the five jurors once the draw block passes. |
| `commitVote(jobId, vote, salt)` | Commit a vote (1 = client, 2 = worker) with a secret salt. |
| `revealVote(jobId, vote, salt)` | Reveal the vote after the commit window. |
| `finalize(jobId)` | Execute the verdict once voting is done. |
| `abortStaleCase(jobId)` | Split a case no jury could be drawn for. |
| `withdrawEscrow()` / `withdrawCourt()` | Pull owed BNB from the escrow / court. |
| `getJob / getCase / getJurors / getRecord / hasAgentID / poolSize / disputeFee / claimableEscrow / claimableCourt / jobCount / jurySize / quorum` | Reads. |
| `waitForFinalized(jobId, { pollIntervalMs, timeoutMs, fromBlock })` | Poll until Finalized/Cancelled, return the verdict. |
| `computeCommitment(jobId, juror, vote, salt)` / `randomSalt()` | Commit-reveal helpers. |

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # tsc -> dist/
npm run smoke       # full lifecycle against a local Anvil chain
```

The smoke test spawns Anvil, deploys `MockAgentID` plus the three protocol
contracts with short windows, and drives the SDK through the happy path and
a full dispute (draw, commit, reveal, finalize, withdraw), asserting
balances, claimables, votes and reputation records. It needs `anvil` on
PATH (or `~/.foundry/bin/anvil`) and the Foundry build artifacts in
`../out/`.

## Known limits (honest)

- Juror selection uses a future blockhash, which a block producer could
  theoretically influence. It is disclosed, not hidden; Chainlink VRF is
  the production path.
- Juror rewards go to jurors who revealed with the majority. Commit-reveal
  hides votes until the reveal window closes, which limits copying, but it
  does not eliminate herd incentives.
- Agent ID makes one person running fifty juror wallets harder; it does not
  stop collusion, bribery, or coordinated groups of real people.
