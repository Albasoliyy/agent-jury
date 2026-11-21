import { AgentIDAbi } from "./abi/AgentID";
import { JobEscrowAbi } from "./abi/JobEscrow";
import { JuryCourtAbi } from "./abi/JuryCourt";
import { ReputationRegistryAbi } from "./abi/ReputationRegistry";

export { AgentIDAbi, JobEscrowAbi, JuryCourtAbi, ReputationRegistryAbi };

/**
 * Official Binance Agent ID contract (BNB Chain mainnet, ERC-721,
 * non-transferable, one per person). balanceOf > 0 means the address
 * holds an Agent ID.
 */
export const AGENT_ID_ADDRESS =
  "0x60b9262456de011f7d15a54cdd8c48baaa8b022f" as const;

/**
 * Deployment addresses.
 *
 * The contracts are NOT deployed yet. These are placeholder zero
 * addresses; Milestone 7 (deployment) fills them in with the real
 * BNB Chain Testnet / Mainnet addresses. Until then the UI renders
 * a "not deployed yet" state and every contract call is disabled
 * instead of failing against a wrong address.
 *
 * Chain target for the first deployment: BNB Chain Testnet (97).
 * Agent ID itself lives on BNB Chain Mainnet (56) and is read
 * directly from mainnet for eligibility checks.
 */
export const CONTRACTS = {
  jobEscrow: "0x0000000000000000000000000000000000000000" as const,
  juryCourt: "0x0000000000000000000000000000000000000000" as const,
  reputationRegistry:
    "0x0000000000000000000000000000000000000000" as const,
  agentID: AGENT_ID_ADDRESS,
} as const;

export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

/** True once the contracts have real deployment addresses. */
export const DEPLOYED =
  CONTRACTS.jobEscrow !== ZERO_ADDRESS &&
  CONTRACTS.juryCourt !== ZERO_ADDRESS &&
  CONTRACTS.reputationRegistry !== ZERO_ADDRESS;

/** First block to scan for protocol events once deployed (set at deploy time). */
export const DEPLOY_BLOCK = 0n;

/** JobEscrow Status enum (src/JobEscrow.sol). */
export const JOB_STATUS = [
  "None",
  "Open",
  "Accepted",
  "Submitted",
  "Disputed",
  "Arbitration",
  "Completed",
  "Resolved",
  "Refunded",
  "Cancelled",
] as const;

/** JuryCourt Phase enum (src/JuryCourt.sol). */
export const CASE_PHASE = [
  "None",
  "Awaiting worker",
  "Awaiting draw",
  "Voting",
  "Finalized",
  "Cancelled",
] as const;

/** Outcome enum (src/Interfaces.sol). 0 = ClientWins, 1 = WorkerWins, 2 = Split. */
export const OUTCOME = ["Client wins", "Worker wins", "Split"] as const;

/** JuryCourt constants. */
export const JURY_SIZE = 5;
export const QUORUM = 3;

/** Vote values: 1 = client, 2 = worker (src/JuryCourt.sol). */
export const VOTE_CLIENT = 1 as const;
export const VOTE_WORKER = 2 as const;
