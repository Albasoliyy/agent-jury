# Agent Jury — Hackathon Submission Checklist

**Hackathon:** Binance Wallet + BNB Chain Agent ID Hackathon
**Prize pool:** 60,000 USDC — Ecosystem Growth 29,000 USDC · Innovation
29,000 USDC · Community Promotion 20 × $100
**Submissions:** 2026-11-18 08:00 UTC → **2026-12-09 08:00 UTC**
**Review:** Dec 9–17 · **Public review:** Dec 17–20
**Project:** Agent Jury — dispute system for agent-to-agent work
**Repo:** TBD (user creates the public GitHub repo; do not create it here)

> Status as of 2026-11-19. "Done" means verified in this repo, not claimed.
> Nothing below is deployed, submitted, or pushed to GitHub yet.

## Awards at a glance

| Award | What it needs | Status |
|---|---|---|
| **Innovation** (29,000 USDC) | Product live + **≥ 30 Agent ID addresses** interacted; judged 100 pts: Agent ID depth 30%, practicality 25%, completion 25%, innovation 20% | 🔲 Pending — product not live yet |
| **Ecosystem Growth** (29,000 USDC) | Top 10 by on-chain metrics: interacting Agent ID addresses, tx volume / tx count | 🔲 Pending — no mainnet activity yet |
| **Community Promotion** (20 × $100) | Original X posts about the project with `#BinanceWalletHackathon` `#AgenticWallet`, link submitted via the campaign survey | 🔲 Pending — posts not written |

One award per project. Winners also get a two-digit Agent ID claim spot.

## Submission requirements

### 1. Contracts deployed + verified on BscScan

| Item | Status | What's missing |
|---|---|---|
| Contracts built (Foundry, Solidity 0.8.24) | ✅ Done | — |
| `forge test` — 73/73 pass (16 lifecycle + 41 adversarial + 16 wiring/edge) | ✅ Done | — |
| Security review (Milestone 6) — 4 issues fixed, properties verified | ✅ Done | — |
| Deploy to **BNB Chain testnet** | 🔲 Pending — **BLOCKED on faucet funding** | Code ready: MockAgentID built + tested (83/83 forge), Deploy.s.sol takes AGENT_ID override, both deploy scripts simulate clean (~7.14M gas total, ~0.0007 tBNB at 0.1 gwei). Deployer `0xf81032d487357eCDa2b01e867e0914219560db71` holds 0 tBNB — needs a 0.3 tBNB faucet claim (faucet is hCaptcha-gated, claim in a browser). Then: DeployMock → Deploy (AGENT_ID=mock) → `testnet-lifecycle.mjs setup/phase1/phase2`. |
| Verify all three contracts on BscScan testnet | 🔲 Pending | `--verify --etherscan-api-key $BSCSCAN_KEY` at deploy time — **no BSCSCAN_KEY exists**; create one at bscscan.com or verify via the site UI after deploy. |
| Full lifecycle on testnet (job → dispute → draw → commit → reveal → finalize → withdraw) | 🔲 Pending | Scripted: `script/testnet-lifecycle.mjs` (setup → phase1 → wait for commit window → phase2). Needs the testnet deploy + ≥ 7 jurors. |
| Deploy to **mainnet** | 🔲 Pending | Needs testnet clean first **and** a small BNB top-up — user has not confirmed the top-up yet. |
| Verify all three contracts on BscScan mainnet | 🔲 Pending | Blocked on mainnet deploy. |

**Testnet Agent ID — RESOLVED with a mock (user approved 2026-11-21):**
verified on-chain that the real Agent ID has NO code on testnet
(`eth_getCode` returns `0x`; mainnet returns bytecode), so no testnet
wallet can hold one. The testnet demo uses our own `MockAgentID`
(`src/MockAgentID.sol`): minimal ERC-721, one non-transferable token per
wallet, open mint — testnet-only, clearly labelled, never on mainnet.
`Deploy.s.sol` defaults `AGENT_ID` to the real mainnet address, so a
mainnet deploy can never accidentally use the mock. The mock proves
mechanics only; the ≥ 30 real Agent ID interactions still need mainnet.

### 2. Open-source public repo

| Item | Status | What's missing |
|---|---|---|
| Code complete in `~/workspace/agent-jury/` (contracts, frontend, SDK, tests, docs) | ✅ Done | — |
| Public GitHub repo created | 🔲 Pending | **The user creates the repo himself** (GitHub App cannot create repos). Then fill it via the connector's push_files flow. |
| Repo contains the full source + README + LICENSE (MIT) | 🔲 Pending | Blocked on repo creation. |
| Commit history honest about authorship | ✅ Done | The four contracts are built on the author's AgentCourt contract set (he wrote them with another AI — his work). Frontend and SDK are new work for this project. Say so in the repo/README. |
| No secrets in the repo (no private keys, no API keys) | ✅ Done | Re-check before pushing: `grep -r` for keys in `frontend/`, `sdk/`, `script/`. |

### 3. Frontend live

| Item | Status | What's missing |
|---|---|---|
| Frontend built (Next.js 14 + wagmi + RainbowKit, 8 routes, `npm run build` clean) | ✅ Done | — |
| Contract addresses wired in (`frontend/lib/contracts.ts` + `DEPLOY_BLOCK`) | 🔲 Pending | Blocked on testnet deploy. |
| Frontend deployed + publicly reachable | 🔲 Pending | Choose a host (e.g. Vercel) after the testnet deploy. |
| Wallet connect verified in a real browser | 🔲 Pending | Subagent builds can't test this — verify Connect once served. |

### 4. ≥ 30 Agent ID addresses interacting (Innovation Award gate)

| Item | Status | What's missing |
|---|---|---|
| Unique interacting Agent ID addresses | 🔲 Pending — **0 so far** | Everything: deploy, open juror registration, recruitment, demo disputes. |
| Juror pool ≥ 7 (minimum to draw a jury of 5) | 🔲 Pending — **0** | Open registration on the live site; seed with samurat.ai (Phase 1 wallet) + recruited Agent ID holders (X post, Agent ID community, hackathon channel). |
| Public demo dispute #1 (real job posted by samurat.ai and taken by a recruited Agent ID worker, disputed on purpose, settled by a drawn jury) | 🔲 Pending | Needs testnet/mainnet deploy + ≥ 7 jurors. One dispute produces ~10+ on-chain interactions (create, accept, submit, dispute, match, draw, 5 commits, 5 reveals, finalize, withdraws). |
| Demo dispute #2 + open registration to reach 30 | 🔲 Pending | After dispute #1. |
| Interaction count tracked from events (unique Agent ID addresses, tx count) | 🔲 Pending | Count from events after deployment; report the real number, never inflated. |

### 5. Submission form

| Item | Status | What's missing |
|---|---|---|
| Submission filled + sent before 2026-12-09 08:00 UTC | 🔲 Pending | Contract addresses, repo URL, live frontend URL, demo dispute tx hashes, interaction count. |
| Safety red lines respected | ✅ Done (by design) | No web QR login, no bypassing user tx confirmation, no unauthorized transfers, contracts open-source with disclosed owner permissions, no Binance brand impersonation, no seed/private-key collection, no promised returns, risk warnings on trading products, no volume manipulation. Re-verify at submission time. |

### 6. X posts (Community Promotion — 20 × $100)

| Item | Status | What's missing |
|---|---|---|
| Original X posts about Agent Jury with `#BinanceWalletHackathon` `#AgenticWallet` | 🔲 Pending | The two tipping-idea drafts are **obsolete** — rewrite for Agent Jury once the demo dispute exists (a post about a real settled dispute beats a post about a plan). |
| Post links submitted via the campaign survey in the hackathon announcement | 🔲 Pending | Survey URL not captured — get it from the announcement at submission time; do not guess. |

## Open questions for the user (block mainnet + final parameters)

1. **Dispute fee:** **Decided 2026-11-21: $0.005/party (0.00001 BNB).**
2. **Demo windows:** **Decided 2026-11-21: review 2h / match 2h / commit
   1h / reveal 1h / drawTimeout 24h.**
3. **Mainnet top-up:** willing to add a small amount of BNB for the
   mainnet deploys, or should mainnet wait until the testnet demo is proven?
4. **Testnet mock Agent ID:** **Decided 2026-11-21: approved.** Mock
   built (`src/MockAgentID.sol`), tested, deploy scripts ready. Testnet
   demo gated by the mock; mainnet still uses the real Agent ID.

## Order of work

1. ~~Verify testnet Agent ID availability~~ → **done 2026-11-21: no
   testnet Agent ID exists; mock approved and built** → 2. Fund testnet
   deployer from the faucet (0.3 tBNB, browser claim) → 3. Deploy mock +
   deploy testnet + verify → 4. Full lifecycle on testnet → 5. Wire
   frontend + deploy it → 6. Open juror registration, recruit to ≥ 7 →
   7. Demo dispute #1 → 8. Recruit + dispute #2 toward 30 → 9. User
   creates the public repo, push code → 10. Mainnet deploy (if top-up
   confirmed) → 11. X posts + survey → 12. Submit before 2026-12-09
   08:00 UTC.
