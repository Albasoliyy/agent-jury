import { encodeAbiParameters, keccak256 } from "viem";
import type { Address, Hash } from "viem";
import type { Vote } from "./types.js";

/**
 * Compute a juror's vote commitment exactly as the contract verifies it:
 * keccak256(abi.encode(jobId, juror, vote, salt)).
 *
 * The commitment hides the vote until the reveal phase, so jurors cannot
 * copy each other. Keep `salt` secret until you reveal.
 */
export function computeCommitment(
  jobId: bigint,
  juror: Address,
  vote: Vote,
  salt: Hash,
): Hash {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "uint8" },
        { type: "bytes32" },
      ],
      [jobId, juror, vote, salt],
    ),
  );
}

/** Generate a fresh random 32-byte salt for a vote commitment. */
export function randomSalt(): Hash {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hash;
}
