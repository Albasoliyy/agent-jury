# Agent Jury — Architecture (Milestone 1)

## 1. What this is

Agent Jury is a decentralized dispute-resolution protocol for agent-to-agent work
on BNB Chain. One agent hires another; the payment sits in escrow; if the work is
contested, five randomly drawn Agent ID holders vote by commit-reveal and the
contract executes the verdict. Agent ID (one non-transferable ERC-721 per person)
is the Sybil-resistance mechanism: one person, one Agent ID, one juror seat.

## 2. Foundation

The protocol is built on the AgentCourt contract set (user-supplied, Foundry,
Solidity 0.8.24, OpenZeppelin). It compiles clean and **14/14 tests pass**.
The four contracts already implement the core of the brief:

| Brief section | Contract / function | Status |
|---|---|---|
| A. Agent ID verification | `AgentIDGate` — `balanceOf > 0` on `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`, `onlyAgentID` modifier, `hasAgentID` view | Done, no change |
| B. Job escrow | `JobEscrow` — `createJob`, `acceptJob`, `submitWork`, `approve`, `claimAfterTimeout`, `reclaimUndelivered`, `cancelJob`; pull-payment `claimable` + `withdraw` | Done, needs BNB (see §3) |
| C. Dispute creation | `JobEscrow.raiseDispute` / `matchDispute` / `defaultJudgment`; `evidenceHash` (bytes32, IPFS CID hash — evidence itself stays off-chain) | Done, needs BNB |
| D. Jury selection | `JuryCourt` — `joinPool` / `leavePool` (Agent ID gated), `drawJurors` (5 jurors, parties excluded, no duplicates, pool ≥ 7), `abortStaleCase` | Done, randomness caveat (§4) |
| E. Commit-reveal voting | `JuryCourt.commitVote` / `revealVote` — `keccak256(jobId, juror, vote, salt)`, quorum 3 of 5, majority wins, `<3` reveals or tie = Split | Done |
| F. Verdict execution | `JuryCourt.finalize` → `JobEscrow.resolveDispute`; winner fee refunded + dust, loser fee split among majority jurors; `ReputationRegistry` updated; events emitted | Done |
| G. Juror rewards | Fee split in `finalize`: `share = fee / majorityCount` to jurors who revealed with the majority; non-revealers get nothing and are recorded | Done (see note §5) |
| H. Reputation | `ReputationRegistry` — append-only counters: jobsCompleted, disputesWon/Lost/Split, casesJudged, majorityVotes, missedReveals; only escrow/court can write; deployer powers lock after `initialize` | Done, no change |

The brief's eight suggested contracts map onto these four. Splitting them
further would add gas and wiring complexity without adding function, so the
four-contract shape is kept. The frontend and the SDK are the new work.

## 3. BNB adaptation (Milestone 2)

The contracts currently pay jobs and dispute fees in an ERC20 (`IERC20 token`,
`SafeERC20`). The brief allows native BNB, and BNB is the right call: the
user holds BNB, not USDT, and BNB removes the approve/allowance UX step.

Changes, contract by contract:

### JobEscrow
- Remove the `IERC20 token` immutable and the `SafeERC20` import.
- `createJob` becomes `payable`; require `msg.value == amount`; the BNB is
  held by the contract (no transfer call needed — `msg.value` arrives with it).
- `raiseDispute` becomes `payable`; require `msg.value == court.disputeFee()`;
  forward the fee to the court with a low-level `call` (the court has a
  `receive()`).
- `matchDispute` becomes `payable`; same pattern for the worker's fee.
- `withdraw` sends BNB instead of tokens: set `claimable` to 0 first, then
  `(bool ok,) = msg.sender.call{value: amount}("")`, revert if `!ok`.
  (Checks-effects-interactions already holds — `claimable` is zeroed before
  the call — and the pull pattern means a failing recipient cannot block
  anyone else.)
- `claimable` stays a `mapping(address => uint256)`; it now holds wei.
- `amount` stays `uint128` (wei; max ~3.4e38, far above any real job).

### JuryCourt
- Remove the `IERC20 token` immutable and the `SafeERC20` import.
- Add `receive() external payable {}` so the escrow can forward fees.
- `disputeFee` stays a `uint256` immutable; it now means wei.
- `withdraw` sends BNB the same way as the escrow (zero `claimable` first,
  then `call`, revert on failure).
- `finalize` and `abortStaleCase` only touch `claimable`; no token calls, so
  no change beyond the unit (wei).
- The draw, commit, reveal and finalize logic is untouched.

### Interfaces
- `IJuryCourt.disputeFee()` stays (returns wei). No `IERC20` in the
  interfaces. `IJobEscrow`, `IReputationRegistry`, `Outcome`, `IAgentID`
  unchanged.

### Deploy script
- Drop the `TOKEN` env var. New env: `DISPUTE_FEE` (wei, default
  `0.00001 ether` = 0.00001 BNB (~$0.005) per party), `REVIEW_WINDOW`, `MATCH_WINDOW`,
  `COMMIT_WINDOW`, `REVEAL_WINDOW`, `DRAW_TIMEOUT` (seconds).
- Demo/testnet defaults (short, so a full dispute fits in a day):
  review 2h, match 2h, commit 1h, reveal 1h, drawTimeout 24h.
  Mainnet defaults can be raised at deploy time (the windows are immutable
  per deployment, so choose deliberately).
- The fee default (0.00001 BNB ≈ $0.005) was set by the user on
  2026-11-21: deliberately cheap so the user and the 30 Agent ID testers
  can afford to test well. Juror rewards at this level are tiny; revisit
  before mainnet (raise it so juror pay is meaningful).

## 4. Randomness

`JuryCourt.drawJurors` uses `blockhash(drawBlock)` as the seed, then
`keccak256(seed, jobId, i)` to pick pool indices. This is already honestly
disclosed in the contract's own comment: a block producer could theoretically
influence the draw. `block.timestamp` and `block.prevrandao` are not used.

For the hackathon this is acceptable and disclosed. For production stakes
the correct upgrade is Chainlink VRF (request–fulfil, verifiable on-chain),
which needs LINK and a VRF subscription on BNB Chain. VRF is documented as
the production path in the README; it is not wired in for the demo because
it adds a funding dependency and an async fulfilment step that complicates
the 30-interaction push. Do not present blockhash as verifiable randomness.

## 5. Reward note (brief §G)

The brief says: do not reward jurors merely for voting with the majority,
because that encourages herd behaviour. The current code pays only jurors
who revealed **with the majority**. That is a majority-reward. It is kept
for the demo because it is simple, transparent, and the commit-reveal
already hides votes until the reveal window closes (so a juror cannot copy
the majority while voting). The limitation is documented: a future version
can pay all revealers equally and reserve a bonus for majority alignment,
or pay a flat participation fee. Do not claim the current split eliminates
herd incentives.

## 6. Frontend plan (Milestone 3)

Next.js + TypeScript + Tailwind, wagmi/viem, RainbowKit (Binance Wallet
connects through the standard injected-wallet path; never a QR login on the
site). Pages, in build order:

1. Landing — "WHEN AI AGENTS DISAGREE, HUMANS DECIDE.", how it works,
   become a juror, protocol overview. No fabricated statistics.
2. Dashboard — totals read live from the contracts (jobCount, pool size,
   cases) and from events; nothing invented.
3. Hire an Agent — create a job (title/description/deliverables/deadline/
   payment/acceptance criteria are stored as an IPFS JSON blob; only the
   `specHash` goes on-chain), fund escrow in BNB, track status.
4. Dispute Center — active disputes, evidence references (IPFS links),
   jury status, commit/reveal progress, finalized verdicts.
5. Become a Juror — Agent ID check first (calls `hasAgentID`); if the
   wallet holds no Agent ID, show the eligibility requirement plainly.
   Registration, assignments, commit interface (computes the commitment
   locally from vote + salt), reveal interface, history, rewards, reputation.
6. Reputation Explorer — public profile by wallet address: Agent ID
   eligibility, completed work, arbitration history, juror record. No
   Agent ID name-to-wallet lookup.
7. Analytics — unique participating Agent ID addresses, tx count, escrow
   volume, disputes, resolved disputes, juror participation, average
   resolution time. All from contract reads / event indexing, labelled as
   such.

Wallet UX rule from the code: the client approves the **escrow** for
job amount + dispute fee (two separate `payable` calls in the BNB version:
`createJob` with `msg.value = amount`, then `raiseDispute` with
`msg.value = disputeFee`); the worker pays the fee in `matchDispute`.
The frontend must make this explicit so no one signs a confusing approval.

## 7. Deployment plan (Milestone 7)

1. BNB Chain Testnet first. Deploy registry → escrow → court, wire
   `setCourt` + `initialize`, verify all three on BscScan testnet.
   Test BNB is free from the testnet faucet.
2. Run the full lifecycle on testnet: register ≥ 7 jurors (test wallets
   need testnet Agent IDs — see risk below), create a job, fund, submit,
   dispute, match, draw, commit, reveal, finalize, withdraw.
3. Mainnet only when testnet is clean. Mainnet needs a small BNB top-up
   for the three deploys (estimate and confirm before broadcasting).
   Verify on BscScan mainnet.

**Testnet Agent ID risk — VERIFIED 2026-11-21: no testnet Agent ID
exists** (`eth_getCode` on the mainnet address returns `0x` on testnet).
The testnet run therefore uses our own `MockAgentID` (testnet-only,
user-approved 2026-11-21): deploy the mock, then deploy Agent Jury with
`AGENT_ID=<mock address>`. `Deploy.s.sol` defaults to the real mainnet
Agent ID, so mainnet can never accidentally use the mock. The mock
proves mechanics only; the ≥ 30 real Agent ID interactions still need
mainnet.

## 8. The 30+ interactions plan

The Innovation Award needs a live product and ≥ 30 Agent ID addresses
interacting. The pool needs ≥ 7 to draw a jury. Plan:

- Open juror registration on the live site (any Agent ID holder can join
  the pool in one transaction).
- Seed the pool with samurat.ai (the Phase 1 wallet — user decided
  2026-11-21 ~15:06 WAT: Agent Jury is for samurat.ai first, albasoliyy.ai
  joins in a later phase) plus recruited Agent ID holders (X post, Agent ID
  community, hackathon channel).
- Run a public demo dispute: a real job posted by samurat.ai and taken by a
  recruited Agent ID worker, disputed on purpose, settled by a drawn jury.
  This single dispute produces ~10+ on-chain interactions (create, accept,
  submit, dispute, match, draw, 5 commits, 5 reveals, finalize,
  withdraws).
- Repeat with a second demo dispute and open registration to reach 30.
- Track unique interacting Agent ID addresses from events; report the
  real number, never inflated.

## 9. Agentic integration (Milestone 5)

A documented SDK (TypeScript, viem-based) plus an MCP tool set so an
external agent can: create a job, fund escrow, submit deliverables,
request arbitration, submit evidence references (IPFS), monitor dispute
status, retrieve a finalized verdict, read a reputation record. Every
asset-moving call is a user-signed transaction; the SDK never holds a key
and never requests a seed phrase.

## 10. Security posture (Milestone 6)

Already in the contracts: reentrancy-safe pull payments, checks-effects-
interactions, no owner/admin after wiring locks, commit-reveal hides votes,
parties excluded from their own jury, no duplicate jurors per case, quorum
and Split fallback, stale-case abort. Documented limits: blockhash
randomness (§4), majority-reward herd incentive (§5), Agent ID reduces
Sybil risk but does not stop collusion, bribery, or coordinated real
people. Adversarial tests to add in Milestone 2: double registration,
non-Agent-ID juror rejection, double vote, wrong-salt reveal, early/late
commit and reveal, finalize before reveal window, fee accounting
conservation, reentrancy on withdraw.

### Milestone 6 findings (2026-11-19, `test/Adversarial.t.sol`, 41 new tests)

Fixed:
- **Split outcome under-recorded juror reputation (medium).** `finalize`'s
  Split branch called `recordMissedReveal` for non-revealers but never
  `recordJuror` for revealers, so `casesJudged` stayed 0 for every juror in
  a split case. Now revealers get `recordJuror(juror, false)`.
- **Failed draw was deterministically stuck (low, liveness).** A draw that
  picked < 5 jurors in 64 attempts reverted on a fixed seed, so every retry
  failed identically until the blockhash expired 256 blocks later. It now
  clears the partial picks, moves `drawBlock` to a fresh block and emits
  `DrawRestarted` (same pattern as the stale-blockhash path).
- **`receive()` accepted BNB from anyone (low).** Direct transfers would be
  locked forever with no sweep. It now reverts unless `msg.sender` is the
  escrow (verified: SDK and deploy script only ever pay the court via the
  escrow's `_forwardFee`).
- **`setCourt` accepted `address(0)` (low).** Now reverts `BadInput`.

Verified, no change needed: pull-payment reentrancy (malicious-recipient
tests pay exactly once on both escrow and court `withdraw`); fee
conservation across all three outcomes, including a 7-wei fee (1 wei dust
goes to the winner) and a 7-wei escrow split (3/4, no wei lost or created);
commit-reveal binding (wrong salt / wrong vote / double commit / double
reveal all revert); parties can never be drawn for their own case
(proven with an exact 7-address pool); jurors who leave the pool mid-case
can still vote; every fund path has a permissionless exit
(`defaultJudgment`, `abortStaleCase`, `finalize`, `claimAfterTimeout`,
`reclaimUndelivered`), so no party can lock funds by going silent.

Not fixed (accepted, documented): blockhash randomness (§4) and the
majority-reward herd incentive (§5) — both need a protocol change (VRF /
flat participation pay), not a patch. Residual risks for the README:
colluding jurors can force a Split by not revealing (fees are refunded, so
the cost is delay, not theft); a juror can be drawn for several cases at
once; `submitWork`/`createJob` accept zero hashes (cosmetic, no funds at
risk). Gas: `drawJurors` now uses `abi.encodePacked` for the per-attempt
hash (fixed-size inputs, no ambiguity); full-dispute finalize ~350k gas,
draw ~310k gas, deploy ~1.72M (escrow) / ~2.16M (court) gas — see
`forge test --gas-report`. No public interface, fee, or window changed.

## 11. Open questions for the user

1. **Authorship:** did you write the AgentCourt contracts, or where did
   they come from? Needed so the submission is honestly yours.
2. **Dispute fee:** **Decided 2026-11-21: $0.005 per party
   (0.00001 BNB).**
3. **Windows:** **Decided 2026-11-21: review 2h / match 2h / commit 1h /
   reveal 1h / drawTimeout 24h.**
4. **Mainnet top-up:** are you willing to add a small amount of BNB for
   the mainnet deploys, or should mainnet wait until the testnet demo is
   proven?
5. **Testnet mock Agent ID:** **Decided 2026-11-21: approved.** The real
   Agent ID has no testnet deployment, so the testnet demo is gated by
   our own testnet-only `MockAgentID` (see §7). Mainnet still uses the
   real Agent ID.
