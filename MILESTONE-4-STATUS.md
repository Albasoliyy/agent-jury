# Agent Jury — Milestone 4 (testnet) status — 2026-11-21

## Done in this run

- **Dispute fee changed (user decision 2026-11-21):** `0.001 BNB` → **`0.00001 BNB
  (~$0.005 at ~$534/BNB)` per party.** Changed the default only:
  `script/Deploy.s.sol:24` (`vm.envOr("DISPUTE_FEE", uint256(0.00001 ether))`).
  The contracts take the fee as a constructor arg, so no contract code changed.
  Docs updated to match: `README.md` (table, flow, mermaid, deploy comment,
  limitations), `ARCHITECTURE.md` (§3, §11 Q2), `SUBMISSION-CHECKLIST.md`
  (open questions Q1/Q2 marked decided).
- **Demo windows confirmed (user decision 2026-11-21):** review 2h / match 2h /
  commit 1h / reveal 1h / drawTimeout 24h — already the deploy-script defaults,
  no change needed.
- **Forge suite: 73/73 PASS** (57 Adversarial + 16 AgentCourt, 0 failed).
  Fee change broke nothing (tests pass explicit fees; the deploy default is
  not asserted by any test).

## Testnet RPC — HEALTHY (2026-11-21 ~14:15 WAT)

All endpoints respond, chain 97, block ~0x895ae3c:
- `https://data-seed-prebsc-1-s1.bnbchain.org:8545` ✅
- `https://data-seed-prebsc-2-s1.bnbchain.org:8545` ✅
- `https://bsc-testnet.publicnode.com` ✅
- `https://bsc-testnet-rpc.publicnode.com` ✅
- `https://data-seed-prebsc-1-s3.bnbchain.org:8545` ✅

(The 2026-11-19 total timeout on the prebsc-1 seed is resolved.)

## BLOCKER — no Agent ID on BSC testnet (verified 2026-11-21)

**Evidence:**
- `eth_getCode(0x60b9262456de011f7d15a54cdd8c48baaa8b022f)` on testnet (chain 97)
  returns `0x` — **no contract at the Agent ID address on testnet**.
- Same call on mainnet (chain 56) returns full bytecode (control check ✅).
- `eth_call` `totalSupply()` to that address on testnet returns empty `0x`.
- The hackathon announcement lists ONLY the mainnet contract and says Agent ID
  "can only be claimed within the Binance App" — no testnet deployment exists.

**Consequence:** `AgentIDGate` calls `agentID.balanceOf(account)` on the address
baked in at deploy time (`script/Deploy.s.sol`, `AGENT_ID` constant). Against a
no-code address the call returns empty data and the ABI decode reverts, so on
testnet **every Agent ID-gated function and every `hasAgentID` view would
revert** — `createJob`, `acceptJob`, `joinPool`, and all dispute/juror flows.
A testnet wallet cannot hold a real Agent ID, so no real juror pool is
possible on testnet as deployed today.

**Observed, NOT adopted:** the PowAgentMine project publishes a testnet mock
Agent ID registry (`0x33Adc9AB0641d6A488555a1ea4F9595a860C4588`, code present on
testnet) and a testnet contract (`0xDc57188982d4cE00Bc7F2E257b1e36e4C7f153Ed`).
That is a third party's contract — do not point Agent Jury at it without a
deliberate decision.

## Fix needed (mock-gate option, per checklist/ARCHITECTURE §7)

Deploy **our own** minimal mock Agent ID on testnet and point the testnet
deployment at it. Steps, once approved:
1. Add a minimal `MockAgentID` (ERC-721, one non-transferable token per
   wallet, open mint) — testnet-only, clearly labelled, never on mainnet.
2. Make `script/Deploy.s.sol` accept an `AGENT_ID` env override (currently
   hardcoded to the mainnet address) so testnet uses the mock and mainnet
   keeps the real `0x60b926...`.
3. Deploy mock → mint Agent IDs to 7+ fresh test wallets → deploy Agent Jury
   against the mock → verify on BscScan testnet → run the full lifecycle →
   wire `frontend/lib/contracts.ts`.

**Needs parent/user go-ahead** — this changes the deploy script and the
testnet deployment is gated by our own mock, not the real Agent ID. It proves
mechanics only; the Innovation Award's ≥30 real Agent ID interactions still
need mainnet (top-up decision still open).

## NOT done (blocked, deliberately not started)

- No testnet deployer key created, no faucet funds requested, no contracts
  deployed, no BscScan verification, no lifecycle run, no frontend wiring.
- No GitHub repo created (user creates it). Nothing submitted to the hackathon.
- Mainnet: untouched. No real BNB spent, no mainnet wallets/keys used.

---

## Continuation — mock built, deploy ready, BLOCKED on faucet funding (2026-11-21 ~14:20 WAT)

User APPROVED the mock-gate fix on a voice call 2026-11-21 ~14:16 WAT.

### Done in this run
- **`src/MockAgentID.sol` (new):** minimal ERC-721 ("Mock Agent ID",
  MOCKID), one non-transferable token per wallet, open `mint()`,
  approvals blocked. Big TESTNET-ONLY header comment: never mainnet.
- **`test/MockAgentID.t.sol` (new):** 10 tests (mint, incrementing ids,
  one-per-wallet, open mint, transfer/safeTransfer/approve/
  setApprovalForAll all revert, zero balance, mint-to-zero reverts).
- **Forge suite: 83/83 PASS** (73 existing + 10 new, 0 failed).
- **`script/Deploy.s.sol`:** accepts `AGENT_ID` env override; DEFAULT
  stays the real mainnet address (`MAINNET_AGENT_ID` constant) and the
  script prints a WARNING when a non-mainnet address is used. Logs the
  agentID in use.
- **`script/DeployMock.s.sol` (new):** deploys the mock, logs its address.
- **Dry runs (simulation, no broadcast):** DeployMock 1,287,176 gas;
  Deploy 5,857,380 gas; total ~7.14M gas ≈ 0.0007 tBNB at 0.1 gwei.
- **Fresh testnet-only wallets** (`script/gen-test-wallets.mjs`,
  keys in `.testnet-wallets.json`, mode 600, gitignored): deployer
  `0xf81032d487357eCDa2b01e867e0914219560db71`, client
  `0xf9BF680dF21A5F1f92C535865266Da8Db39cB8D4`, worker
  `0x28fB522722eB148bd20Cb5f655B7ceB210107c1B`, jurors 0–6
  (`0x6aa0…`, `0x441E…`, `0x111A…`, `0x7597…`, `0x534a…`,
  `0xF2B8…`, `0xb22B…`). Testnet only, no real funds, never mainnet.
- **`script/testnet-lifecycle.mjs` (new):** `setup` (fund actors, mint
  mock IDs, jurors join pool), `phase1` (job → dispute → draw → commit
  3-2 client-majority), `phase2` (reveal → finalize → withdraw),
  `status`. Two-phase because the commit window is 1h: reveals open
  1h after the draw and close 1h after that.
- **Docs:** README (Deploy flow, mock table row, limitations),
  ARCHITECTURE (§7 risk resolved, §11 Q3 + Q5 decided),
  SUBMISSION-CHECKLIST (testnet rows, open Q4, order of work).

### BLOCKER — faucet funding (needs a browser)
- Deployer balance verified on-chain: **0 tBNB**.
- The BNB testnet faucet (https://testnet.bnbchain.org/faucet-smart)
  requires an **hCaptcha token** in the claim request — cannot be
  claimed programmatically. Claim 0.1 tBNB in a browser for deployer
  `0xf81032d487357eCDa2b01e867e0914219560db71`, then re-invoke this task
  to deploy + run the lifecycle.
- **BscScan verification also blocked:** no `BSCSCAN_KEY` exists
  anywhere (checked env + workspace). Either create one at bscscan.com
  or verify the deployed contracts via the BscScan site UI after deploy.

### NOT done (waiting on funding)
No contracts deployed, no BscScan verification, no lifecycle run, no
frontend wiring (`frontend/lib/contracts.ts` still zero addresses).
No GitHub repo, nothing submitted. Mainnet untouched, no real BNB spent.

---

## DEPLOYED — testnet live (2026-11-21 ~15:30 WAT)

**Funding:** Telegram bot @bnbchain_official_bot sent **0.1 tBNB** (user
messaged it himself). Verified on-chain on 2 endpoints before deploy:
balance exactly 0.1 tBNB, nonce 0.

**Gas quirk:** the testnet RPC estimates EIP-1559 fees at 1 wei, but the
network requires a minimum tip of 0.1 gwei, so the first two broadcast
attempts failed (`transaction gas price below minimum`). Fix: `--legacy
--gas-price 200000000` (0.2 gwei). The stale first broadcast had to be
cleared with `--start-fresh` (`--resume` replays the old EIP-1559 tx).

### Deployed contracts (chain 97, BNB Chain testnet)

| Contract | Address | Tx | Block | Gas used |
|---|---|---|---|---|
| MockAgentID | `0x9DC34D613282A0EF9aEd445243141f0EbAf0fa69` | `0xc002ae85c8de26930b6a8879272b7daa0b34ed50c1b329fc202453ecd47a9a7a` | 143634657 | 990,932 |
| ReputationRegistry | `0xfe28847C5064950004bE60d691A3532f5E6b8bF3` | `0x4b92be5c5cb2edc8a3762aa270e9dd3aa57c9aebc8db5b2a031d5fe1c94acb3d` | 144038158 | 504,221 |
| JobEscrow | `0x44B17c37E10DC85943BCe63F0acFb30016a0ff19` | `0xd50704748edf68c90b6f8cc9303a97738f6b238bd23967197484cd768e2f6840` | 144038159 | 1,724,034 |
| JuryCourt | `0x4E2a0DA0B6476D8F83aF67b90bFe7bca2cae2bD3` | `0x1ad0dc0c7769e9d64a95c18a99c0e04bdaccf0ae06ccbcfecdac40623269d9a1` | 144038159 | 2,158,176 |

Wiring txs (both status 1, block 144038159): `setCourt`
`0x176a1369ffa69aa14d4cda397433ec1f5e0ab037a468a3bea59eb2898d103e1f`
(45,506 gas), `registry.initialize`
`0x4817a9f1cbf2a3c39528cd2da1c03f850a446dd61f6f62b836ce24d934ee9a52`
(68,379 gas). Total deploy gas 5,491,248 (mock 990,932 + jury 4,500,316).
All four contracts verified to hold code on-chain (`cast code` non-empty).
Params as deployed: agentID = mock above, disputeFee 0.00001 BNB
($0.005/party), review 7200s / match 7200s / commit 3600s / reveal 3600s /
drawTimeout 86400s. Deploy record: `.testnet-deploy.json` (mode 600).

**BscScan verification — BLOCKED (no key):** `forge verify-contract`
attempted 2026-11-21 ~15:31 WAT → `ETHERSCAN_API_KEY must be set to use
Etherscan as a verifier`. No `BSCSCAN_KEY` exists anywhere; per
instructions no account/key was created. Verify manually via the BscScan
testnet site UI with the addresses above.

### Lifecycle setup — DONE (2026-11-21 ~15:32 WAT)
`node script/testnet-lifecycle.mjs setup` — exit 0, all 25 txs status 1:
funded client 0.02 / worker 0.005 / jurors 0–6 0.003 each; minted one mock
Agent ID to all 9 actors; all 7 jurors joined the pool. **Pool size: 7**
(minimum to draw a jury of 5). Independently re-verified with
`testnet-lifecycle.mjs status`: pool 7, every actor mockID=1.
Deployer balance after deploy + setup: **0.0533651837 tBNB**, nonce 24.

### Next
- `phase1` (job → dispute → draw → commit) any time; `phase2` (reveal →
  finalize → withdraw) 1h after the draw, inside the 1h reveal window.
- Then: BscScan verify (needs a free key or the site UI), wire
  `frontend/lib/contracts.ts`, deploy + host the frontend, GitHub repo
  (user creates it), mainnet deploy (top-up decision still open).
- Mainnet untouched, no real BNB spent, no real wallets/keys used.
