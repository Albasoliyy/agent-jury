import { AgentIDAbi } from "./abi/AgentID";
import { JobEscrowAbi } from "./abi/JobEscrow";
import { JuryCourtAbi } from "./abi/JuryCourt";
import { MockAgentIDAbi } from "./abi/MockAgentID";
import { ReputationRegistryAbi } from "./abi/ReputationRegistry";

export {
  AgentIDAbi,
  JobEscrowAbi,
  JuryCourtAbi,
  MockAgentIDAbi,
  ReputationRegistryAbi,
};

/**
 * Official Binance Agent ID contract (BNB Chain mainnet, ERC-721,
 * non-transferable, one per person). balanceOf > 0 means the address
 * holds an Agent ID.
 */
export const AGENT_ID_ADDRESS =
  "0x60b9262456de011f7d15a54cdd8c48baaa8b022f" as const;

/**
 * Deployment addresses — BNB Chain Testnet (97), deployed 2026-11-21.
 *
 * Testnet demo uses the testnet-only MockAgentID as the identity
 * contract (the real Agent ID has no testnet deployment). Mainnet
 * deploys use the real Agent ID (AGENT_ID_ADDRESS) and get their own
 * addresses here; see README.md for the address table.
 */
export const CONTRACTS = {
  jobEscrow: "0x44B17c37E10DC85943BCe63F0acFb30016a0ff19" as const,
  juryCourt: "0x4E2a0DA0B6476D8F83aF67b90bFe7bca2cae2bD3" as const,
  reputationRegistry:
    "0xfe28847C5064950004bE60d691A3532f5E6b8bF3" as const,
  agentID:
    "0x9DC34D613282A0EF9aEd445243141f0EbAf0fa69" as const, // MockAgentID (testnet only)
} as const;

/**
 * True when this deployment points the identity check at the
 * testnet-only MockAgentID instead of the real Agent ID. Only true
 * on the testnet deployment; a mainnet deployment sets
 * CONTRACTS.agentID to AGENT_ID_ADDRESS and this is false.
 */
export const IS_MOCK_AGENT_ID =
  (CONTRACTS.agentID as string).toLowerCase() !==
  AGENT_ID_ADDRESS.toLowerCase();

export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

/** True once the contracts have real deployment addresses. */
export const DEPLOYED =
  (CONTRACTS.jobEscrow as string) !== ZERO_ADDRESS &&
  (CONTRACTS.juryCourt as string) !== ZERO_ADDRESS &&
  (CONTRACTS.reputationRegistry as string) !== ZERO_ADDRESS;

/** First block to scan for protocol events (first deploy receipt, 2026-11-21). */
export const DEPLOY_BLOCK = 144038113n;

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
