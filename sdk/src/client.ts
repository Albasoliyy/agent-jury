import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  parseAbiItem,
  parseEventLogs,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import type {
  Account,
  Address,
  Chain,
  Hash,
  PublicClient,
  WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AgentIDAbi, JobEscrowAbi, JuryCourtAbi, ReputationRegistryAbi } from "./abi/index.js";
import { computeCommitment } from "./commitment.js";
import { CasePhase, JobStatus, Outcome } from "./types.js";
import type {
  AgentJuryConfig,
  Case,
  CreatedJob,
  FinalizedResult,
  Job,
  ReputationRecord,
  Vote,
  WaitForFinalizedOptions,
} from "./types.js";

/** Binance Agent ID contract on BNB Chain mainnet. */
export const AGENT_ID_MAINNET: Address =
  "0x60b9262456de011f7d15a54cdd8c48baaa8b022f";

function resolveChain(chainId: number, rpcUrl?: string): Chain {
  if (chainId === 56) {
    return rpcUrl
      ? { ...bsc, rpcUrls: { default: { http: [rpcUrl] } } }
      : bsc;
  }
  if (chainId === 97) {
    return rpcUrl
      ? { ...bscTestnet, rpcUrls: { default: { http: [rpcUrl] } } }
      : bscTestnet;
  }
  if (!rpcUrl) {
    throw new Error(
      `AgentJuryClient: rpcUrl is required for chainId ${chainId} (only 56 and 97 have built-in RPC URLs).`,
    );
  }
  return defineChain({
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: { decimals: 18, name: "BNB", symbol: "BNB" },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

/**
 * Client for the Agent Jury protocol.
 *
 * Every method that moves assets (createJob, raiseDispute, matchDispute,
 * withdraw, ...) sends a real on-chain transaction through the configured
 * wallet client. The wallet — not the SDK — signs it, so the user (or the
 * agent's operator) always confirms the transaction before any BNB moves.
 * The SDK never holds a key, never requests a seed phrase, and never
 * broadcasts anything the caller did not ask for.
 *
 * Contract addresses are configuration, not constants: pass the deployed
 * addresses for the network you target. Until the protocol is deployed,
 * the zero addresses below are placeholders and every call will revert.
 */
export class AgentJuryClient {
  readonly chain: Chain;
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient | undefined;
  /** Full signer account (kept so writeContract can sign locally). */
  readonly account: Account | undefined;
  readonly escrowAddress: Address;
  readonly courtAddress: Address;
  readonly registryAddress: Address;
  readonly agentIdAddress: Address;

  constructor(config: AgentJuryConfig) {
    this.escrowAddress = config.escrowAddress;
    this.courtAddress = config.courtAddress;
    this.registryAddress = config.registryAddress;
    this.agentIdAddress = config.agentIdAddress;

    const chainId = config.chainId ?? 56;
    this.chain = resolveChain(chainId, config.rpcUrl);
    const transport = config.rpcUrl ? http(config.rpcUrl) : http();

    this.publicClient =
      config.publicClient ??
      createPublicClient({ chain: this.chain, transport });

    if (config.walletClient) {
      this.walletClient = config.walletClient;
      this.account = config.walletClient.account;
    } else if (config.privateKey) {
      const account = privateKeyToAccount(config.privateKey);
      this.walletClient = createWalletClient({
        account,
        chain: this.chain,
        transport,
      });
      this.account = account;
    }
  }

  // ------------------------------------------------------------ internal

  private requireWallet(): { wallet: WalletClient; account: Account } {
    if (!this.walletClient || !this.account) {
      throw new Error(
        "AgentJuryClient: this method needs a signer. Pass walletClient (or privateKey) in the constructor.",
      );
    }
    return { wallet: this.walletClient, account: this.account };
  }

  private async writeEscrow(
    functionName: "acceptJob" | "approve" | "cancelJob" | "claimAfterTimeout" | "createJob" | "defaultJudgment" | "matchDispute" | "raiseDispute" | "reclaimUndelivered" | "submitWork" | "withdraw",
    args: readonly unknown[],
    value?: bigint,
  ): Promise<Hash> {
    const { wallet, account } = this.requireWallet();
    return wallet.writeContract({
      abi: JobEscrowAbi,
      account,
      address: this.escrowAddress,
      args: args as never,
      chain: this.chain,
      functionName: functionName as never,
      value,
    });
  }

  private async writeCourt(
    functionName: "abortStaleCase" | "commitVote" | "drawJurors" | "finalize" | "joinPool" | "leavePool" | "revealVote" | "withdraw",
    args: readonly unknown[],
  ): Promise<Hash> {
    const { wallet, account } = this.requireWallet();
    return wallet.writeContract({
      abi: JuryCourtAbi,
      account,
      address: this.courtAddress,
      args: args as never,
      chain: this.chain,
      functionName: functionName as never,
    });
  }

  // ------------------------------------------------------------ jobs

  /**
   * Create a job and fund the escrow in native BNB. `amountWei` is both
   * the job's payment and the BNB sent with the transaction (`msg.value`).
   * Returns the transaction hash and the job id (parsed from JobCreated).
   */
  async createJob(
    amountWei: bigint,
    workDeadlineUnix: bigint | number,
    specHash: Hash,
  ): Promise<CreatedJob> {
    const hash = await this.writeEscrow(
      "createJob",
      [amountWei, BigInt(workDeadlineUnix), specHash],
      amountWei,
    );
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const logs = parseEventLogs({
      abi: JobEscrowAbi,
      eventName: "JobCreated",
      logs: receipt.logs,
    });
    const jobId = logs[0]?.args.jobId;
    if (jobId === undefined) {
      throw new Error(
        `AgentJuryClient: createJob mined (${hash}) but no JobCreated event was found.`,
      );
    }
    return { hash, jobId };
  }

  /** Accept an open job. Only an Agent ID holder other than the client can accept. */
  async acceptJob(jobId: bigint): Promise<Hash> {
    return this.writeEscrow("acceptJob", [jobId]);
  }

  /** Submit completed work (a bytes32 hash of the deliverable, e.g. an IPFS CID hash). */
  async submitWork(jobId: bigint, deliverableHash: Hash): Promise<Hash> {
    return this.writeEscrow("submitWork", [jobId, deliverableHash]);
  }

  /** Client accepts the submitted work and releases the escrowed payment to the worker. */
  async approveJob(jobId: bigint): Promise<Hash> {
    return this.writeEscrow("approve", [jobId]);
  }

  /** Worker claims payment when the client stayed silent past the review window. */
  async claimAfterTimeout(jobId: bigint): Promise<Hash> {
    return this.writeEscrow("claimAfterTimeout", [jobId]);
  }

  /** Client reclaims funds when the worker accepted but never delivered. */
  async reclaimUndelivered(jobId: bigint): Promise<Hash> {
    return this.writeEscrow("reclaimUndelivered", [jobId]);
  }

  /** Cancel an open (unaccepted) job and refund the client. */
  async cancelJob(jobId: bigint): Promise<Hash> {
    return this.writeEscrow("cancelJob", [jobId]);
  }

  // ------------------------------------------------------------ disputes

  /**
   * Open a dispute over submitted work. Sends `feeWei` in BNB with the
   * transaction; the escrow forwards it to the court. If `feeWei` is
   * omitted it is read from the court's `disputeFee()`.
   */
  async raiseDispute(
    jobId: bigint,
    evidenceHash: Hash,
    feeWei?: bigint,
  ): Promise<Hash> {
    const fee = feeWei ?? (await this.disputeFee());
    return this.writeEscrow("raiseDispute", [jobId, evidenceHash], fee);
  }

  /**
   * Match the dispute fee (worker side) and send the case to the jury.
   * If `feeWei` is omitted it is read from the court's `disputeFee()`.
   */
  async matchDispute(jobId: bigint, feeWei?: bigint): Promise<Hash> {
    const fee = feeWei ?? (await this.disputeFee());
    return this.writeEscrow("matchDispute", [jobId], fee);
  }

  /** Client wins by default when the worker never matches the fee. Anyone may call it. */
  async defaultJudgment(jobId: bigint): Promise<Hash> {
    return this.writeEscrow("defaultJudgment", [jobId]);
  }

  // ------------------------------------------------------------ jury

  /** Register as a juror. Requires holding an Agent ID. */
  async joinPool(): Promise<Hash> {
    return this.writeCourt("joinPool", []);
  }

  /** Leave the juror pool. */
  async leavePool(): Promise<Hash> {
    return this.writeCourt("leavePool", []);
  }

  /** Draw the five jurors for a case, once the draw block has passed. Anyone may call it. */
  async drawJurors(jobId: bigint): Promise<Hash> {
    return this.writeCourt("drawJurors", [jobId]);
  }

  /**
   * Commit a vote. The commitment is computed locally from the vote and a
   * secret salt, so the vote stays hidden until the reveal phase.
   * `salt` must be kept secret until `revealVote` is called with the same value.
   */
  async commitVote(jobId: bigint, vote: Vote, salt: Hash): Promise<Hash> {
    const { account } = this.requireWallet();
    const commitment = computeCommitment(jobId, account.address, vote, salt);
    return this.writeCourt("commitVote", [jobId, commitment]);
  }

  /** Reveal a previously committed vote, proving it matches the commitment. */
  async revealVote(jobId: bigint, vote: Vote, salt: Hash): Promise<Hash> {
    return this.writeCourt("revealVote", [jobId, vote, salt]);
  }

  /** Finalize a case once all jurors revealed or the reveal window closed. Anyone may call it. */
  async finalize(jobId: bigint): Promise<Hash> {
    return this.writeCourt("finalize", [jobId]);
  }

  /** Abort a case no jury could be drawn for within the draw timeout. Anyone may call it. */
  async abortStaleCase(jobId: bigint): Promise<Hash> {
    return this.writeCourt("abortStaleCase", [jobId]);
  }

  // ------------------------------------------------------------ payouts

  /** Withdraw BNB the escrow owes the caller (job payments and refunds). */
  async withdrawEscrow(): Promise<Hash> {
    return this.writeEscrow("withdraw", []);
  }

  /** Withdraw BNB the court owes the caller (fee refunds and juror rewards). */
  async withdrawCourt(): Promise<Hash> {
    return this.writeCourt("withdraw", []);
  }

  // ------------------------------------------------------------ reads

  async getJob(jobId: bigint): Promise<Job> {
    // viem types multi-output functions as a positional tuple, so read by index:
    // [client, worker, amount, status, workDeadline, reviewDeadline,
    //  matchDeadline, specHash, deliverableHash, evidenceHash]
    const r = await this.publicClient.readContract({
      abi: JobEscrowAbi,
      address: this.escrowAddress,
      args: [jobId],
      functionName: "jobs",
    });
    return {
      amount: r[2],
      client: r[0],
      deliverableHash: r[8],
      evidenceHash: r[9],
      jobId,
      matchDeadline: r[6],
      reviewDeadline: r[5],
      specHash: r[7],
      status: r[3] as JobStatus,
      workDeadline: r[4],
      worker: r[1],
    };
  }

  async getCase(jobId: bigint): Promise<Case> {
    // Positional tuple: [client, worker, phase, activatedAt, drawBlock,
    // commitEnd, revealEnd, clientVotes, workerVotes, revealed]
    const r = await this.publicClient.readContract({
      abi: JuryCourtAbi,
      address: this.courtAddress,
      args: [jobId],
      functionName: "cases",
    });
    return {
      activatedAt: r[3],
      client: r[0],
      clientVotes: r[7],
      commitEnd: r[5],
      drawBlock: r[4],
      jobId,
      phase: r[2] as CasePhase,
      revealEnd: r[6],
      revealed: r[9],
      worker: r[1],
      workerVotes: r[8],
    };
  }

  async getJurors(jobId: bigint): Promise<Address[]> {
    const result = await this.publicClient.readContract({
      abi: JuryCourtAbi,
      address: this.courtAddress,
      args: [jobId],
      functionName: "jurorsOf",
    });
    return [...result];
  }

  async getRecord(account: Address): Promise<ReputationRecord> {
    const r = await this.publicClient.readContract({
      abi: ReputationRegistryAbi,
      address: this.registryAddress,
      args: [account],
      functionName: "getRecord",
    });
    return {
      casesJudged: r.casesJudged,
      disputesLost: r.disputesLost,
      disputesSplit: r.disputesSplit,
      disputesWon: r.disputesWon,
      jobsCompleted: r.jobsCompleted,
      majorityVotes: r.majorityVotes,
      missedReveals: r.missedReveals,
    };
  }

  /** True when the address holds at least one Agent ID (balanceOf > 0). */
  async hasAgentID(account: Address): Promise<boolean> {
    const balance = await this.publicClient.readContract({
      abi: AgentIDAbi,
      address: this.agentIdAddress,
      args: [account],
      functionName: "balanceOf",
    });
    return balance > 0n;
  }

  async poolSize(): Promise<bigint> {
    return this.publicClient.readContract({
      abi: JuryCourtAbi,
      address: this.courtAddress,
      functionName: "poolSize",
    });
  }

  async disputeFee(): Promise<bigint> {
    return this.publicClient.readContract({
      abi: JuryCourtAbi,
      address: this.courtAddress,
      functionName: "disputeFee",
    });
  }

  async claimableEscrow(account: Address): Promise<bigint> {
    return this.publicClient.readContract({
      abi: JobEscrowAbi,
      address: this.escrowAddress,
      args: [account],
      functionName: "claimable",
    });
  }

  async claimableCourt(account: Address): Promise<bigint> {
    return this.publicClient.readContract({
      abi: JuryCourtAbi,
      address: this.courtAddress,
      args: [account],
      functionName: "claimable",
    });
  }

  async jobCount(): Promise<bigint> {
    return this.publicClient.readContract({
      abi: JobEscrowAbi,
      address: this.escrowAddress,
      functionName: "jobCount",
    });
  }

  async jurySize(): Promise<bigint> {
    return this.publicClient.readContract({
      abi: JuryCourtAbi,
      address: this.courtAddress,
      functionName: "JURY_SIZE",
    });
  }

  async quorum(): Promise<bigint> {
    return this.publicClient.readContract({
      abi: JuryCourtAbi,
      address: this.courtAddress,
      functionName: "QUORUM",
    });
  }

  async getCommitment(jobId: bigint, juror: Address): Promise<Hash> {
    return this.publicClient.readContract({
      abi: JuryCourtAbi,
      address: this.courtAddress,
      args: [jobId, juror],
      functionName: "commitments",
    });
  }

  async getRevealedVote(jobId: bigint, juror: Address): Promise<Vote | 0> {
    const v = await this.publicClient.readContract({
      abi: JuryCourtAbi,
      address: this.courtAddress,
      args: [jobId, juror],
      functionName: "revealedVote",
    });
    return v as Vote | 0;
  }

  async isJuror(jobId: bigint, account: Address): Promise<boolean> {
    return this.publicClient.readContract({
      abi: JuryCourtAbi,
      address: this.courtAddress,
      args: [jobId, account],
      functionName: "isJuror",
    });
  }

  // ------------------------------------------------------------ waiting

  /** Read the finalized outcome for a case from its CaseFinalized event. */
  async getFinalizedOutcome(
    jobId: bigint,
    fromBlock: bigint = 0n,
  ): Promise<Outcome | null> {
    const logs = await this.publicClient.getLogs({
      address: this.courtAddress,
      args: { jobId },
      event: parseAbiItem(
        "event CaseFinalized(uint256 indexed jobId, uint8 outcome)",
      ),
      fromBlock,
      toBlock: "latest",
    });
    const outcome = logs[0]?.args.outcome;
    return outcome === undefined ? null : (outcome as Outcome);
  }

  /**
   * Poll a case until it is Finalized or Cancelled, then return the phase
   * and the verdict. A Cancelled case (stale draw, or worker never matched)
   * always resolves as a Split. Throws if `timeoutMs` elapses first.
   */
  async waitForFinalized(
    jobId: bigint,
    options: WaitForFinalizedOptions = {},
  ): Promise<FinalizedResult> {
    const pollIntervalMs = options.pollIntervalMs ?? 2000;
    const timeoutMs = options.timeoutMs ?? 600_000;
    const fromBlock = options.fromBlock ?? 0n;
    const startedAt = Date.now();

    for (;;) {
      const c = await this.getCase(jobId);
      if (c.phase === CasePhase.Finalized) {
        const outcome = await this.getFinalizedOutcome(jobId, fromBlock);
        return { outcome, phase: CasePhase.Finalized };
      }
      if (c.phase === CasePhase.Cancelled) {
        return { outcome: Outcome.Split, phase: CasePhase.Cancelled };
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(
          `AgentJuryClient: waitForFinalized timed out after ${timeoutMs}ms (case still in phase ${CasePhase[c.phase]}).`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  // ------------------------------------------------------------ calldata

  /** Calldata for `createJob`, for offline signing. `value` must equal `amountWei`. */
  encodeCreateJob(
    amountWei: bigint,
    workDeadlineUnix: bigint | number,
    specHash: Hash,
  ): Hash {
    return encodeFunctionData({
      abi: JobEscrowAbi,
      args: [amountWei, BigInt(workDeadlineUnix), specHash],
      functionName: "createJob",
    });
  }

  /** Calldata for `commitVote`, with the commitment computed locally. */
  encodeCommitVote(jobId: bigint, vote: Vote, salt: Hash): Hash {
    const { account } = this.requireWallet();
    return encodeFunctionData({
      abi: JuryCourtAbi,
      args: [jobId, computeCommitment(jobId, account.address, vote, salt)],
      functionName: "commitVote",
    });
  }
}
