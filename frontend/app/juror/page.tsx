"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { DeployedGate } from "@/components/NotDeployed";
import { TxButton } from "@/components/TxButton";
import { Card, CasePhaseBadge, StatCard } from "@/components/ui";
import {
  CONTRACTS,
  DEPLOYED,
  IS_MOCK_AGENT_ID,
  JuryCourtAbi,
  MockAgentIDAbi,
  VOTE_CLIENT,
  VOTE_WORKER,
} from "@/lib/contracts";
import { formatBnb, formatDate, shortAddress } from "@/lib/format";
import {
  checkAgentID,
  useAllJobs,
  useCourtClaimable,
  useJurorState,
  usePoolIndex,
  usePoolSize,
  useReputation,
} from "@/lib/hooks";
import {
  computeCommitment,
  loadSalt,
  randomSalt,
  storeSalt,
} from "@/lib/commitment";

const inputCls =
  "w-full rounded-lg border border-line bg-navy-900 px-3 py-2 text-sm text-white placeholder:text-mist focus:border-electric-500 focus:outline-none";
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export default function JurorPage() {
  const { address, isConnected } = useAccount();
  const [hasID, setHasID] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  // Bumped after a mock mint so the eligibility check re-runs without
  // waiting for the wallet address to change.
  const [eligibilityRun, setEligibilityRun] = useState(0);

  const { data: poolSize } = usePoolSize();
  const { data: poolIndex } = usePoolIndex(address);
  const { data: courtClaimable } = useCourtClaimable(address);
  const { data: record } = useReputation(address);
  const { jobs } = useAllJobs();

  // Commit panel state
  const [commitJobId, setCommitJobId] = useState("");
  const [commitVote, setCommitVote] = useState<1 | 2>(VOTE_CLIENT);
  const [commitSalt, setCommitSalt] = useState<`0x${string}`>("" as `0x${string}`);
  // Reveal panel state
  const [revealJobId, setRevealJobId] = useState("");
  const [revealVote, setRevealVote] = useState<1 | 2>(VOTE_CLIENT);
  const [revealSalt, setRevealSalt] = useState("");

  const commitJobIdBig = commitJobId ? BigInt(commitJobId) : null;
  const revealJobIdBig = revealJobId ? BigInt(revealJobId) : null;
  const commitState = useJurorState(commitJobIdBig, address);
  const revealState = useJurorState(revealJobIdBig, address);

  // Agent ID check runs against the identity contract for this
  // deployment (the mock on testnet, the real one on mainnet), even
  // before the Agent Jury contracts are deployed.
  useEffect(() => {
    if (!address) {
      setHasID(null);
      return;
    }
    setChecking(true);
    setCheckError(null);
    checkAgentID(address)
      .then(setHasID)
      .catch((e: Error) => setCheckError(e.message))
      .finally(() => setChecking(false));
  }, [address, eligibilityRun]);

  // Auto-fill the reveal salt from local storage when the job changes.
  useEffect(() => {
    if (!revealJobIdBig || !address) return;
    const saved = loadSalt(revealJobIdBig, address);
    if (saved) {
      setRevealVote(saved.vote);
      setRevealSalt(saved.salt);
    }
  }, [revealJobIdBig, address]);

  const commitment =
    commitJobIdBig && address && commitSalt
      ? computeCommitment(commitJobIdBig, address, commitVote, commitSalt)
      : null;

  const revealCommitment =
    revealJobIdBig && address && revealSalt.length === 66
      ? computeCommitment(
          revealJobIdBig,
          address,
          revealVote,
          revealSalt as `0x${string}`,
        )
      : null;
  const onChainCommitment = revealState.commitment.data as
    | `0x${string}`
    | undefined;
  const revealMatches =
    revealCommitment !== null &&
    onChainCommitment !== undefined &&
    onChainCommitment !== ZERO_BYTES32 &&
    revealCommitment.toLowerCase() === onChainCommitment.toLowerCase();

  // Which voting cases was this wallet actually drawn for?
  const jurorChecks = useReadContracts({
    contracts: jobs.map((j) => ({
      address: CONTRACTS.juryCourt,
      abi: JuryCourtAbi,
      functionName: "isJuror",
      args: [j.id, address as `0x${string}`],
    })),
    query: { enabled: DEPLOYED && !!address && jobs.length > 0 },
  });
  const myCases = jobs.filter((j, i) => {
    const entry = jurorChecks.data?.[i];
    return (
      j.case.phase >= 2 &&
      j.case.phase <= 4 &&
      entry?.status === "success" &&
      (entry.result as unknown as boolean) === true
    );
  });

  const inPool = (poolIndex ?? 0n) > 0n;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Become a Juror</h1>
        <p className="mt-1 max-w-2xl text-mist">
          Agent ID holders settle disputes. One non-transferable Agent ID,
          one juror seat. Jurors who reveal with the majority split the
          losing party&apos;s dispute fee.
        </p>
      </div>

      {/* Agent ID eligibility: checked live against the identity contract for this deployment. */}
      <Card title="Step 1: Agent ID eligibility">
        {!isConnected && (
          <p className="text-sm text-mist">
            {IS_MOCK_AGENT_ID
              ? "Connect your wallet to check whether it holds a mock Agent ID. The check reads "
              : "Connect your wallet to check whether it holds an Agent ID. The check reads "}
            <code className="font-mono text-xs">balanceOf</code>{" "}
            {IS_MOCK_AGENT_ID
              ? "on the free mock Agent ID contract on BNB Chain testnet, one per wallet."
              : "on the official Agent ID contract on BNB Chain mainnet."}
          </p>
        )}
        {isConnected && checking && (
          <p className="text-sm text-mist">
            Checking Agent ID for {shortAddress(address!)}…
          </p>
        )}
        {isConnected && !checking && hasID === true && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
            <p className="font-semibold text-emerald-400">
              {IS_MOCK_AGENT_ID
                ? "Eligible: this wallet holds a mock Agent ID."
                : "Eligible: this wallet holds an Agent ID."}
            </p>
            <p className="mt-1 text-sm text-mist">
              You can join the juror pool below. Your wallet address is
              recorded with your registration; there is no central identity
              database.
            </p>
          </div>
        )}
        {isConnected && !checking && hasID === false && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            {IS_MOCK_AGENT_ID ? (
              <>
                <p className="font-semibold text-amber-300">
                  Not eligible: this wallet holds no mock Agent ID.
                </p>
                <p className="mt-1 text-sm text-mist">
                  This is the testnet demo, so jury participation uses a
                  free mock Agent ID (ERC-721, non-transferable, one per
                  wallet) instead of the real Agent ID. Mint one below,
                  then this check runs again and you can join the juror
                  pool.
                </p>
                <div className="mt-3">
                  <TxButton
                    label="Mint free mock Agent ID"
                    title="Mint one free mock Agent ID to this wallet. Testnet only, one per wallet."
                    prepare={() => ({
                      address: CONTRACTS.agentID,
                      abi: MockAgentIDAbi,
                      functionName: "mint",
                      args: [address as `0x${string}`],
                    })}
                    onSuccess={() => setEligibilityRun((n) => n + 1)}
                  />
                </div>
                <p className="mt-2 font-mono text-xs text-mist">
                  Mock Agent ID: {CONTRACTS.agentID} (BNB Chain testnet)
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-amber-300">
                  Not eligible: this wallet holds no Agent ID.
                </p>
                <p className="mt-1 text-sm text-mist">
                  Jury participation requires an Agent ID (ERC-721,
                  non-transferable, one per person), claimed through Binance
                  Wallet. Without one, this wallet cannot register as a juror,
                  vote, or earn juror rewards. Holding an Agent ID does not
                  guarantee one human per wallet in every situation, it makes
                  duplicate juror participation much harder.
                </p>
                <p className="mt-2 font-mono text-xs text-mist">
                  Agent ID: 0x60b9262456de011f7d15a54cdd8c48baaa8b022f (BNB Chain
                  mainnet)
                </p>
              </>
            )}
          </div>
        )}
        {checkError && (
          <p className="mt-2 text-sm text-red-400">
            Eligibility check failed: {checkError}
          </p>
        )}
      </Card>

      <DeployedGate>
        {/* Pool registration */}
        <Card title="Step 2: Juror pool">
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm text-mist">
              Registered jurors:{" "}
              <span className="font-semibold text-white">
                {poolSize === undefined ? "N/A" : poolSize.toString()}
              </span>{" "}
              (a jury needs at least 7 in the pool to draw 5)
            </p>
            {address && hasID === true && !inPool && (
              <TxButton
                label="Join the juror pool"
                title="Register as a juror. Requires Agent ID; one registration per wallet."
                prepare={() => ({
                  address: CONTRACTS.juryCourt,
                  abi: JuryCourtAbi,
                  functionName: "joinPool",
                })}
              />
            )}
            {address && inPool && (
              <>
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                  In the pool
                </span>
                <TxButton
                  label="Leave the pool"
                  title="Remove yourself from the juror pool."
                  prepare={() => ({
                    address: CONTRACTS.juryCourt,
                    abi: JuryCourtAbi,
                    functionName: "leavePool",
                  })}
                  className="rounded-lg border border-line bg-navy-900 px-4 py-2 text-sm font-semibold text-mist transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
                />
              </>
            )}
            {address && hasID === false && (
              <p className="text-sm text-mist">
                Joining requires an Agent ID (see Step 1).
              </p>
            )}
          </div>
          {(courtClaimable ?? 0n) > 0n && (
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <p className="text-sm text-mist">
                Your claimable juror rewards / fee refunds:{" "}
                <span className="font-semibold text-white">
                  {formatBnb(courtClaimable)}
                </span>
              </p>
              <TxButton
                label="Withdraw rewards"
                title="Pull your claimable BNB from the court."
                prepare={() => ({
                  address: CONTRACTS.juryCourt,
                  abi: JuryCourtAbi,
                  functionName: "withdraw",
                })}
              />
            </div>
          )}
        </Card>

        {/* Assignments */}
        <Card title="Your assignments" wide>
          {!address && (
            <p className="text-sm text-mist">
              Connect a wallet to see your jury assignments.
            </p>
          )}
          {address && myCases.length === 0 && (
            <p className="text-sm text-mist">
              No cases in voting right now. When you are drawn for a case it
              appears here, use the commit panel below to vote.
            </p>
          )}
          <div className="space-y-3">
            {myCases.map((j) => (
              <div
                key={j.id.toString()}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-navy-900 p-3 text-sm"
              >
                <span className="text-white">Job #{j.id.toString()}</span>
                <CasePhaseBadge phase={j.case.phase} />
                <span className="text-mist">
                  Revealed {j.case.revealed}/5 · Client {j.case.clientVotes} ·
                  Worker {j.case.workerVotes}
                </span>
                <span className="text-mist">
                  Commit ends {formatDate(j.case.commitEnd)} · Reveal ends{" "}
                  {formatDate(j.case.revealEnd)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Commit */}
        <Card title="Step 3: Commit your vote (secret)">
          <p className="text-sm text-mist">
            Pick a verdict and a random salt. The site computes the
            commitment hash <em>locally</em> and shows it to you before you
            sign, your vote stays secret until the reveal phase.{" "}
            <strong className="text-slate-200">
              Keep the salt safe.
            </strong>{" "}
            Without it you cannot reveal, and a missed reveal is recorded
            against your reputation. The salt is also saved in this browser
            so the reveal panel can recover it.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">Job (dispute) id</label>
              <input className={inputCls} value={commitJobId} onChange={(e) => setCommitJobId(e.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 3" inputMode="numeric" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">Your verdict</label>
              <select className={inputCls} value={commitVote} onChange={(e) => setCommitVote(Number(e.target.value) as 1 | 2)}>
                <option value={VOTE_CLIENT}>Client wins (1)</option>
                <option value={VOTE_WORKER}>Worker wins (2)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">Salt (random secret)</label>
              <div className="flex gap-2">
                <input className={`${inputCls} font-mono text-xs`} value={commitSalt} onChange={(e) => setCommitSalt(e.target.value as `0x${string}`)} placeholder="0x…" />
                <button type="button" onClick={() => setCommitSalt(randomSalt())} className="shrink-0 rounded-lg border border-line bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-700">
                  Generate
                </button>
              </div>
            </div>
          </div>
          {commitment && (
            <div className="mt-4 rounded-lg border border-line bg-navy-900 p-4">
              <p className="text-sm text-mist">
                Commitment that will be sent on-chain:{" "}
                <code className="break-all font-mono text-xs text-slate-200">
                  {commitment}
                </code>
              </p>
              <p className="mt-1 text-xs text-mist">
                keccak256(abi.encode(jobId, your address, vote, salt)), the
                contract stores only this hash until you reveal.
              </p>
              {commitState.commitment.data !== undefined &&
                (commitState.commitment.data as string) !== ZERO_BYTES32 && (
                  <p className="mt-2 text-sm text-amber-300">
                    You have already committed for this job. Committing again
                    will revert.
                  </p>
                )}
            </div>
          )}
          <div className="mt-4">
            <TxButton
              label="Commit vote"
              disabled={!commitment || !address || !commitJobIdBig}
              title="Send the commitment hash on-chain. Your vote and salt stay secret."
              prepare={() => ({
                address: CONTRACTS.juryCourt,
                abi: JuryCourtAbi,
                functionName: "commitVote",
                args: [commitJobIdBig!, commitment!],
              })}
              onSuccess={() => {
                if (commitJobIdBig && address) {
                  storeSalt(commitJobIdBig, address, commitVote, commitSalt);
                }
              }}
            />
          </div>
        </Card>

        {/* Reveal */}
        <Card title="Step 4: Reveal your vote">
          <p className="text-sm text-mist">
            After the commit window closes, reveal your vote and salt. The
            site recomputes the commitment and checks it against the hash
            stored on-chain <em>before</em> you sign, if they do not match,
            the transaction would revert, so it is blocked here instead.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">Job (dispute) id</label>
              <input className={inputCls} value={revealJobId} onChange={(e) => setRevealJobId(e.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 3" inputMode="numeric" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">Your verdict</label>
              <select className={inputCls} value={revealVote} onChange={(e) => setRevealVote(Number(e.target.value) as 1 | 2)}>
                <option value={VOTE_CLIENT}>Client wins (1)</option>
                <option value={VOTE_WORKER}>Worker wins (2)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">Salt</label>
              <input className={`${inputCls} font-mono text-xs`} value={revealSalt} onChange={(e) => setRevealSalt(e.target.value)} placeholder="0x… (auto-filled if saved in this browser)" />
            </div>
          </div>
          {revealCommitment && (
            <div className="mt-4 rounded-lg border border-line bg-navy-900 p-4">
              <p className="text-sm text-mist">
                Recomputed commitment:{" "}
                <code className="break-all font-mono text-xs text-slate-200">
                  {revealCommitment}
                </code>
              </p>
              <p className="mt-1 text-sm text-mist">
                Stored on-chain:{" "}
                <code className="break-all font-mono text-xs text-slate-200">
                  {onChainCommitment ?? "N/A"}
                </code>
              </p>
              {onChainCommitment === ZERO_BYTES32 && (
                <p className="mt-2 text-sm text-amber-300">
                  No commitment found for this job and wallet, did you
                  commit, and is this the same wallet?
                </p>
              )}
              {onChainCommitment !== undefined &&
                onChainCommitment !== ZERO_BYTES32 && (
                  <p
                    className={`mt-2 text-sm font-semibold ${revealMatches ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {revealMatches
                      ? "Match: the reveal will be accepted."
                      : "MISMATCH: vote or salt is wrong. Do not send: the transaction would revert."}
                  </p>
                )}
            </div>
          )}
          <div className="mt-4">
            <TxButton
              label="Reveal vote"
              disabled={!revealMatches || !revealJobIdBig}
              title="Reveal your vote and salt. The contract verifies them against your commitment."
              prepare={() => ({
                address: CONTRACTS.juryCourt,
                abi: JuryCourtAbi,
                functionName: "revealVote",
                args: [revealJobIdBig!, revealVote, revealSalt as `0x${string}`],
              })}
            />
          </div>
        </Card>

        {/* Juror record */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Cases judged" value={record ? String(record.casesJudged) : "N/A"} sub="Reveals you completed" />
          <StatCard label="Majority votes" value={record ? String(record.majorityVotes) : "N/A"} sub="Reveals that matched the verdict" />
          <StatCard label="Missed reveals" value={record ? String(record.missedReveals) : "N/A"} sub="Commits never revealed" />
          <StatCard label="Jobs completed" value={record ? String(record.jobsCompleted) : "N/A"} sub="As client or worker" />
        </div>
      </DeployedGate>
    </div>
  );
}
