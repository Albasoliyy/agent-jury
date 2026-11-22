import { createPublicClient, http } from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { useReadContract, useReadContracts } from "wagmi";
import {
  AGENT_ID_ADDRESS,
  AgentIDAbi,
  CONTRACTS,
  DEPLOYED,
  IS_MOCK_AGENT_ID,
  JobEscrowAbi,
  JuryCourtAbi,
  ReputationRegistryAbi,
} from "./contracts";

/** Agent ID lives on BNB Chain Mainnet — read it there directly, always. */
const mainnetClient = createPublicClient({
  chain: bsc,
  transport: http(),
});

/** Mock Agent ID lives on BNB Chain Testnet, read it there. */
const testnetClient = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

/**
 * Does `address` hold an Agent ID (balanceOf > 0)? On the testnet
 * deployment the identity contract is the free MockAgentID, so the
 * check reads it on testnet. On mainnet it reads the official Agent
 * ID on mainnet, exactly as before.
 */
export async function checkAgentID(address: `0x${string}`): Promise<boolean> {
  if (IS_MOCK_AGENT_ID) {
    const bal = await testnetClient.readContract({
      address: CONTRACTS.agentID,
      abi: AgentIDAbi,
      functionName: "balanceOf",
      args: [address],
    });
    return bal > 0n;
  }
  const bal = await mainnetClient.readContract({
    address: AGENT_ID_ADDRESS,
    abi: AgentIDAbi,
    functionName: "balanceOf",
    args: [address],
  });
  return bal > 0n;
}

export type Job = {
  client: `0x${string}`;
  worker: `0x${string}`;
  amount: bigint;
  status: number;
  workDeadline: bigint;
  reviewDeadline: bigint;
  matchDeadline: bigint;
  specHash: `0x${string}`;
  deliverableHash: `0x${string}`;
  evidenceHash: `0x${string}`;
};

export type Case = {
  client: `0x${string}`;
  worker: `0x${string}`;
  phase: number;
  activatedAt: bigint;
  drawBlock: bigint;
  commitEnd: bigint;
  revealEnd: bigint;
  clientVotes: number;
  workerVotes: number;
  revealed: number;
};

export type ReputationRecord = {
  jobsCompleted: number;
  disputesWon: number;
  disputesLost: number;
  disputesSplit: number;
  casesJudged: number;
  majorityVotes: number;
  missedReveals: number;
};

function toJob(raw: readonly unknown[]): Job {
  return {
    client: raw[0] as `0x${string}`,
    worker: raw[1] as `0x${string}`,
    amount: raw[2] as bigint,
    status: raw[3] as number,
    workDeadline: raw[4] as bigint,
    reviewDeadline: raw[5] as bigint,
    matchDeadline: raw[6] as bigint,
    specHash: raw[7] as `0x${string}`,
    deliverableHash: raw[8] as `0x${string}`,
    evidenceHash: raw[9] as `0x${string}`,
  };
}

function toCase(raw: readonly unknown[]): Case {
  return {
    client: raw[0] as `0x${string}`,
    worker: raw[1] as `0x${string}`,
    phase: raw[2] as number,
    activatedAt: raw[3] as bigint,
    drawBlock: raw[4] as bigint,
    commitEnd: raw[5] as bigint,
    revealEnd: raw[6] as bigint,
    clientVotes: raw[7] as number,
    workerVotes: raw[8] as number,
    revealed: raw[9] as number,
  };
}

export function useJobCount() {
  return useReadContract({
    address: CONTRACTS.jobEscrow,
    abi: JobEscrowAbi,
    functionName: "jobCount",
    query: { enabled: DEPLOYED },
  });
}

export function useJob(jobId: bigint | null) {
  return useReadContract({
    address: CONTRACTS.jobEscrow,
    abi: JobEscrowAbi,
    functionName: "jobs",
    args: jobId === null ? undefined : [jobId],
    query: { enabled: DEPLOYED && jobId !== null },
  });
}

export function useCase(jobId: bigint | null) {
  return useReadContract({
    address: CONTRACTS.juryCourt,
    abi: JuryCourtAbi,
    functionName: "cases",
    args: jobId === null ? undefined : [jobId],
    query: { enabled: DEPLOYED && jobId !== null },
  });
}

export function usePoolSize() {
  return useReadContract({
    address: CONTRACTS.juryCourt,
    abi: JuryCourtAbi,
    functionName: "poolSize",
    query: { enabled: DEPLOYED },
  });
}

export function useDisputeFee() {
  return useReadContract({
    address: CONTRACTS.juryCourt,
    abi: JuryCourtAbi,
    functionName: "disputeFee",
    query: { enabled: DEPLOYED },
  });
}

export function useEscrowClaimable(address: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACTS.jobEscrow,
    abi: JobEscrowAbi,
    functionName: "claimable",
    args: address ? [address] : undefined,
    query: { enabled: DEPLOYED && !!address },
  });
}

export function useCourtClaimable(address: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACTS.juryCourt,
    abi: JuryCourtAbi,
    functionName: "claimable",
    args: address ? [address] : undefined,
    query: { enabled: DEPLOYED && !!address },
  });
}

export function usePoolIndex(address: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACTS.juryCourt,
    abi: JuryCourtAbi,
    functionName: "poolIndex",
    args: address ? [address] : undefined,
    query: { enabled: DEPLOYED && !!address },
  });
}

export function useReputation(address: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACTS.reputationRegistry,
    abi: ReputationRegistryAbi,
    functionName: "getRecord",
    args: address ? [address] : undefined,
    query: { enabled: DEPLOYED && !!address },
  });
}

/**
 * Read every job (1..jobCount, capped at 100) plus its court case.
 * Returns null while the count is unknown.
 */
export function useAllJobs() {
  const { data: count } = useJobCount();
  const n = count === undefined ? 0 : Math.min(Number(count), 100);
  const ids = Array.from({ length: n }, (_, i) => BigInt(i + 1));

  const jobs = useReadContracts({
    contracts: ids.map((id) => ({
      address: CONTRACTS.jobEscrow,
      abi: JobEscrowAbi,
      functionName: "jobs",
      args: [id],
    })),
    query: { enabled: DEPLOYED && n > 0 },
  });

  const cases = useReadContracts({
    contracts: ids.map((id) => ({
      address: CONTRACTS.juryCourt,
      abi: JuryCourtAbi,
      functionName: "cases",
      args: [id],
    })),
    query: { enabled: DEPLOYED && n > 0 },
  });

  if (!DEPLOYED || count === undefined) {
    return { ids, jobs: [] as { id: bigint; job: Job; case: Case }[], loading: count === undefined && DEPLOYED };
  }

  const out: { id: bigint; job: Job; case: Case }[] = [];
  ids.forEach((id, i) => {
    const j = jobs.data?.[i];
    const c = cases.data?.[i];
    if (j?.status === "success" && c?.status === "success") {
      out.push({
        id,
        job: toJob(j.result as unknown as readonly unknown[]),
        case: toCase(c.result as unknown as readonly unknown[]),
      });
    }
  });
  return { ids, jobs: out, loading: jobs.isPending || cases.isPending };
}

/** Jurors drawn for a case. */
export function useJurors(jobId: bigint | null) {
  return useReadContract({
    address: CONTRACTS.juryCourt,
    abi: JuryCourtAbi,
    functionName: "jurorsOf",
    args: jobId === null ? undefined : [jobId],
    query: { enabled: DEPLOYED && jobId !== null },
  });
}

/** Whether `address` is a juror on `jobId`, and their stored commitment. */
export function useJurorState(
  jobId: bigint | null,
  address: `0x${string}` | undefined,
) {
  const isJuror = useReadContract({
    address: CONTRACTS.juryCourt,
    abi: JuryCourtAbi,
    functionName: "isJuror",
    args: jobId !== null && address ? [jobId, address] : undefined,
    query: { enabled: DEPLOYED && jobId !== null && !!address },
  });
  const commitment = useReadContract({
    address: CONTRACTS.juryCourt,
    abi: JuryCourtAbi,
    functionName: "commitments",
    args: jobId !== null && address ? [jobId, address] : undefined,
    query: { enabled: DEPLOYED && jobId !== null && !!address },
  });
  const revealedVote = useReadContract({
    address: CONTRACTS.juryCourt,
    abi: JuryCourtAbi,
    functionName: "revealedVote",
    args: jobId !== null && address ? [jobId, address] : undefined,
    query: { enabled: DEPLOYED && jobId !== null && !!address },
  });
  return { isJuror, commitment, revealedVote };
}
