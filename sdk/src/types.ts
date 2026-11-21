import type { Address, Hash, PublicClient, WalletClient } from "viem";

/** A juror's vote: 1 = in favour of the client, 2 = in favour of the worker. */
export type Vote = 1 | 2;
export const VOTE_CLIENT: Vote = 1;
export const VOTE_WORKER: Vote = 2;

/** JobEscrow.Status — mirrors the on-chain enum. */
export enum JobStatus {
  None = 0,
  Open = 1,
  Accepted = 2,
  Submitted = 3,
  Disputed = 4,
  Arbitration = 5,
  Completed = 6,
  Resolved = 7,
  Refunded = 8,
  Cancelled = 9,
}

/** JuryCourt.Phase — mirrors the on-chain enum. */
export enum CasePhase {
  None = 0,
  AwaitingWorker = 1,
  AwaitingDraw = 2,
  Voting = 3,
  Finalized = 4,
  Cancelled = 5,
}

/** Outcome — mirrors the on-chain enum (also the CaseFinalized event payload). */
export enum Outcome {
  ClientWins = 0,
  WorkerWins = 1,
  Split = 2,
}

export interface Job {
  jobId: bigint;
  client: Address;
  worker: Address;
  /** Payment amount in wei (native BNB). */
  amount: bigint;
  status: JobStatus;
  workDeadline: bigint;
  reviewDeadline: bigint;
  matchDeadline: bigint;
  specHash: Hash;
  deliverableHash: Hash;
  evidenceHash: Hash;
}

export interface Case {
  jobId: bigint;
  client: Address;
  worker: Address;
  phase: CasePhase;
  activatedAt: bigint;
  drawBlock: bigint;
  commitEnd: bigint;
  revealEnd: bigint;
  clientVotes: number;
  workerVotes: number;
  revealed: number;
}

export interface ReputationRecord {
  jobsCompleted: number;
  disputesWon: number;
  disputesLost: number;
  disputesSplit: number;
  casesJudged: number;
  majorityVotes: number;
  missedReveals: number;
}

export interface AgentJuryAddresses {
  /** JobEscrow contract address. */
  escrowAddress: Address;
  /** JuryCourt contract address. */
  courtAddress: Address;
  /** ReputationRegistry contract address. */
  registryAddress: Address;
  /** Binance Agent ID contract (ERC-721). Mainnet: 0x60b9262456de011f7d15a54cdd8c48baaa8b022f. */
  agentIdAddress: Address;
}

export interface AgentJuryConfig extends AgentJuryAddresses {
  /** JSON-RPC URL. Required unless `publicClient` (and `walletClient`, for writes) is given. */
  rpcUrl?: string;
  /** Chain id. Defaults to 56 (BNB Chain mainnet). 97 is BNB Chain testnet. */
  chainId?: number;
  /** Bring your own viem public client (takes precedence over `rpcUrl`). */
  publicClient?: PublicClient;
  /** Bring your own viem wallet client. Required for any write method. */
  walletClient?: WalletClient;
  /**
   * Hex private key used to build a wallet client from `rpcUrl`.
   * Prefer passing `walletClient` from your own signer instead.
   * The SDK never stores, logs, or transmits this key; it only signs
   * the transactions you explicitly call. Never share a seed phrase.
   */
  privateKey?: Hash;
}

export interface WaitForFinalizedOptions {
  /** Milliseconds between polls. Default 2000. */
  pollIntervalMs?: number;
  /** Give up after this many milliseconds. Default 600000 (10 minutes). */
  timeoutMs?: number;
  /** First block to search for the CaseFinalized event. Default 0n. */
  fromBlock?: bigint;
}

export interface FinalizedResult {
  phase: CasePhase.Finalized | CasePhase.Cancelled;
  /** Null only if the finalizing event could not be found (e.g. `fromBlock` too late). */
  outcome: Outcome | null;
}

export interface CreatedJob {
  /** Transaction hash of the createJob call. */
  hash: Hash;
  /** Job id assigned by the escrow (parsed from the JobCreated event). */
  jobId: bigint;
}
