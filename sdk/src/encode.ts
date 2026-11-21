import { encodeFunctionData } from "viem";
import type { Hash } from "viem";
import { JobEscrowAbi, JuryCourtAbi } from "./abi/index.js";
import { computeCommitment } from "./commitment.js";
import type { Vote } from "./types.js";
import type { Address } from "viem";

/**
 * Build the calldata for `JobEscrow.createJob` without broadcasting.
 * Useful for offline signing or for agents that assemble transactions
 * themselves. `amountWei` is both the `amount` argument and the `value`
 * that must be sent with the transaction.
 */
export function encodeCreateJobCalldata(
  amountWei: bigint,
  workDeadlineUnix: bigint | number,
  specHash: Hash,
): Hash {
  return encodeFunctionData({
    abi: JobEscrowAbi,
    functionName: "createJob",
    args: [amountWei, BigInt(workDeadlineUnix), specHash],
  });
}

/**
 * Build the calldata for `JuryCourt.commitVote` without broadcasting.
 * The commitment is computed locally from the vote and salt, so the vote
 * itself never appears on chain until the reveal.
 */
export function encodeCommitVoteCalldata(
  jobId: bigint,
  juror: Address,
  vote: Vote,
  salt: Hash,
): Hash {
  const commitment = computeCommitment(jobId, juror, vote, salt);
  return encodeFunctionData({
    abi: JuryCourtAbi,
    functionName: "commitVote",
    args: [jobId, commitment],
  });
}

/** Build the calldata for `JuryCourt.revealVote` without broadcasting. */
export function encodeRevealVoteCalldata(
  jobId: bigint,
  vote: Vote,
  salt: Hash,
): Hash {
  return encodeFunctionData({
    abi: JuryCourtAbi,
    functionName: "revealVote",
    args: [jobId, vote, salt],
  });
}
