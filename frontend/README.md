# Agent Jury — Frontend

Next.js (App Router) + TypeScript + Tailwind CSS + wagmi + viem + RainbowKit
interface for the Agent Jury decentralized arbitration protocol on BNB Chain.

## Status

Milestone 3 — complete and compiling. The contracts are **not deployed yet**,
so `lib/contracts.ts` holds placeholder zero addresses. The app renders fully
and every data page shows a "contracts not deployed yet" state instead of
calling a wrong address. The Agent ID eligibility check works already: it
reads `balanceOf` on the real Agent ID contract on BNB Chain mainnet.

## Run

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
```

## Pages

| Route | Purpose |
|---|---|
| `/` | Landing — "WHEN AI AGENTS DISAGREE, HUMANS DECIDE.", how it works, why Agent ID, contract table. No fabricated statistics. |
| `/dashboard` | Totals read from the contracts, claimable balances (escrow + court) with withdraw, your jobs. |
| `/hire` | Create a job and fund escrow in BNB in one transaction. Only the spec hash goes on-chain; the full spec JSON is shown for IPFS pinning. |
| `/disputes` | Active disputes and finalized verdicts, evidence hashes, jury status, voting progress. Draw / finalize / abort actions. |
| `/juror` | Agent ID check (mainnet `balanceOf`), pool join/leave, assignments, commit + reveal voting, rewards, juror reputation. |
| `/reputation` | Public profile by wallet address. No Agent ID name-to-wallet lookup. |
| `/analytics` | Read-based figures only; event-based figures are labelled unavailable until deployment instead of estimated. |

## Key mechanics

- **Wallet connection** is the standard injected-wallet path (MetaMask,
  Binance Wallet extension, …). There is no QR login on this site and the
  site never asks for a seed phrase. Every asset-moving action is a
  transaction the user signs in their own wallet.
- **Payments are BNB-native.** `createJob` sends the job amount as
  `msg.value`; `raiseDispute` / `matchDispute` each send the dispute fee
  in BNB. There is no token approval step. Pull payments only
  (`claimable` + `withdraw`).
- **Commit-reveal voting.** The commit panel computes
  `keccak256(abi.encode(jobId, juror, vote, salt))` locally in the browser
  (`lib/commitment.ts`) and shows the hash before the user signs
  `commitVote`. The salt is saved in the browser's local storage so the
  reveal panel can recover it. The reveal panel recomputes the commitment
  and compares it with the hash stored on-chain before enabling the
  `revealVote` transaction — a mismatch is blocked in the UI instead of
  reverting on-chain.
- **Agent ID.** Eligibility is `balanceOf > 0` on
  `0x60b9262456de011f7d15a54cdd8c48baaa8b022f` (BNB Chain mainnet). The
  juror pool, job creation and job acceptance all enforce it on-chain
  via `AgentIDGate.onlyAgentID`.

## Deployment (Milestone 7)

After deploying the contracts, set the real addresses in
`lib/contracts.ts` (`CONTRACTS.jobEscrow`, `CONTRACTS.juryCourt`,
`CONTRACTS.reputationRegistry`) and `DEPLOY_BLOCK` to the deployment
block for the event scan. `DEPLOYED` flips to true automatically and
all pages switch from the "not deployed yet" state to live data.

## Known limitations (honest)

- Jury selection uses a future blockhash (see `JuryCourt.drawJurors`).
  A block producer could theoretically influence the draw. The
  production path is Chainlink VRF; it is not wired in for the demo.
- Juror rewards go to jurors who revealed with the majority. That is a
  majority-reward, and commit-reveal hides votes until the reveal window
  closes, but it does not fully eliminate herd incentives.
- Agent ID reduces Sybil risk; it does not stop collusion, bribery, or
  coordinated groups of real people.
- In-browser IPFS pinning is not wired in yet: the hire page shows the
  spec JSON and its hash for the user to pin manually.
- Event-based analytics (unique Agent ID addresses, tx counts, average
  resolution time) need an event scan from the deployment block and are
  labelled unavailable until deployment.
