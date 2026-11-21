import { encodeAbiParameters, keccak256, toHex } from "viem";

/**
 * Commit-reveal commitment helpers.
 *
 * The contract verifies:
 *   keccak256(abi.encode(jobId, juror, vote, salt)) == commitment
 * (JuryCourt.revealVote, vote 1 = client, 2 = worker).
 *
 * The commitment is computed LOCALLY in the browser and shown to the
 * juror before they sign the commitVote transaction. The vote and the
 * salt never leave the juror's machine until the reveal phase.
 */

export function computeCommitment(
  jobId: bigint,
  juror: `0x${string}`,
  vote: 1 | 2,
  salt: `0x${string}`,
): `0x${string}` {
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

/** 32 random bytes from the browser crypto RNG, as a bytes32 hex string. */
export function randomSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function saltKey(jobId: bigint, juror: string): string {
  return `agent-jury-salt-${jobId.toString()}-${juror.toLowerCase()}`;
}

/** Persist a salt in the browser so the reveal step can recover it. */
export function storeSalt(
  jobId: bigint,
  juror: string,
  vote: 1 | 2,
  salt: `0x${string}`,
): void {
  try {
    localStorage.setItem(
      saltKey(jobId, juror),
      JSON.stringify({ vote, salt }),
    );
  } catch {
    // Private mode / storage unavailable: the juror must keep the salt.
  }
}

/** Recover a stored salt (vote + salt) for a job, if one was saved. */
export function loadSalt(
  jobId: bigint,
  juror: string,
): { vote: 1 | 2; salt: `0x${string}` } | null {
  try {
    const raw = localStorage.getItem(saltKey(jobId, juror));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { vote: number; salt: string };
    if (
      (parsed.vote === 1 || parsed.vote === 2) &&
      typeof parsed.salt === "string" &&
      parsed.salt.startsWith("0x") &&
      parsed.salt.length === 66
    ) {
      return { vote: parsed.vote, salt: parsed.salt as `0x${string}` };
    }
    return null;
  } catch {
    return null;
  }
}
