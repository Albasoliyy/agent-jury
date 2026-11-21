"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { TxButton } from "@/components/TxButton";
import { CasePhaseBadge, JobStatusBadge } from "@/components/ui";
import { CONTRACTS, JobEscrowAbi, JuryCourtAbi } from "@/lib/contracts";
import { formatBnb, formatDate, hashString, shortAddress, timeLeft } from "@/lib/format";
import type { Case, Job } from "@/lib/hooks";

type JobCardProps = {
  id: bigint;
  job: Job;
  caseData: Case;
  disputeFee: bigint | undefined;
};

/**
 * One job with every action its current state allows, shown only to
 * the wallet that may take it. Each action is a separate signed
 * transaction — the site never batches approvals silently.
 *
 * Payment note: the client funds escrow by sending BNB with createJob
 * (no token approval). A dispute costs the dispute fee in BNB per
 * party: the client pays it in raiseDispute, the worker matches it
 * in matchDispute.
 */
export function JobCard({ id, job, caseData, disputeFee }: JobCardProps) {
  const { address } = useAccount();
  const [deliverable, setDeliverable] = useState("");
  const [evidence, setEvidence] = useState("");

  const isClient = address?.toLowerCase() === job.client.toLowerCase();
  const isWorker =
    job.worker !== "0x0000000000000000000000000000000000000000" &&
    address?.toLowerCase() === job.worker.toLowerCase();
  const now = Date.now() / 1000;

  const fee = disputeFee ?? 0n;

  return (
    <div className="rounded-xl border border-line bg-navy-800 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">
            Job #{id.toString()}
            <span className="ml-2 font-mono text-xs text-mist">
              spec {job.specHash.slice(0, 12)}…
            </span>
          </p>
          <p className="mt-1 text-xs text-mist">
            Client {shortAddress(job.client)} · Worker{" "}
            {job.worker === "0x0000000000000000000000000000000000000000"
              ? "—"
              : shortAddress(job.worker)}
          </p>
        </div>
        <div className="flex gap-2">
          <JobStatusBadge status={job.status} />
          {job.status >= 4 && job.status !== 9 && (
            <CasePhaseBadge phase={caseData.phase} />
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-mist">Escrow</dt>
          <dd className="font-semibold text-white">{formatBnb(job.amount)}</dd>
        </div>
        <div>
          <dt className="text-xs text-mist">Work deadline</dt>
          <dd className="text-slate-200">
            {formatDate(job.workDeadline)}{" "}
            <span className="text-mist">({timeLeft(job.workDeadline)})</span>
          </dd>
        </div>
        {job.status === 3 && (
          <div>
            <dt className="text-xs text-mist">Review deadline</dt>
            <dd className="text-slate-200">
              {formatDate(job.reviewDeadline)}{" "}
              <span className="text-mist">({timeLeft(job.reviewDeadline)})</span>
            </dd>
          </div>
        )}
        {job.status === 4 && (
          <div>
            <dt className="text-xs text-mist">Match deadline</dt>
            <dd className="text-slate-200">
              {formatDate(job.matchDeadline)}{" "}
              <span className="text-mist">({timeLeft(job.matchDeadline)})</span>
            </dd>
          </div>
        )}
      </dl>

      {job.status >= 4 && job.status !== 9 && (
        <div className="mt-4 rounded-lg border border-line bg-navy-900 p-3 text-sm">
          <p className="text-mist">
            Evidence hash:{" "}
            <code className="break-all font-mono text-xs text-slate-200">
              {job.evidenceHash ===
              "0x0000000000000000000000000000000000000000000000000000000000000000"
                ? "—"
                : job.evidenceHash}
            </code>
          </p>
          {caseData.phase === 3 && (
            <p className="mt-1 text-mist">
              Votes revealed: {caseData.revealed} / 5 · Client{" "}
              {caseData.clientVotes} · Worker {caseData.workerVotes} ·
              Commit ends {formatDate(caseData.commitEnd)} · Reveal ends{" "}
              {formatDate(caseData.revealEnd)}
            </p>
          )}
          {caseData.phase === 2 && (
            <p className="mt-1 text-mist">
              Jury draw target block: {caseData.drawBlock.toString()}. Anyone
              can trigger the draw once that block has passed.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {job.status === 1 && address && !isClient && (
          <TxButton
            label="Accept job"
            title="Accept this job as the worker (requires Agent ID)"
            prepare={() => ({
              address: CONTRACTS.jobEscrow,
              abi: JobEscrowAbi,
              functionName: "acceptJob",
              args: [id],
            })}
          />
        )}
        {job.status === 2 && isWorker && (
          <span className="flex flex-wrap items-center gap-2">
            <input
              value={deliverable}
              onChange={(e) => setDeliverable(e.target.value)}
              placeholder="Deliverable reference (URL / IPFS CID / text)"
              className="w-72 rounded-lg border border-line bg-navy-900 px-3 py-2 text-sm text-white placeholder:text-mist"
            />
            <TxButton
              label="Submit work"
              disabled={!deliverable.trim()}
              title="Submit a deliverable hash. Only the hash goes on-chain."
              prepare={() => ({
                address: CONTRACTS.jobEscrow,
                abi: JobEscrowAbi,
                functionName: "submitWork",
                args: [id, hashString(deliverable.trim())],
              })}
            />
          </span>
        )}
        {job.status === 3 && isClient && (
          <>
            <TxButton
              label="Approve & release payment"
              title="Accept the work. The escrowed BNB becomes claimable by the worker."
              prepare={() => ({
                address: CONTRACTS.jobEscrow,
                abi: JobEscrowAbi,
                functionName: "approve",
                args: [id],
              })}
            />
            <span className="flex flex-wrap items-center gap-2">
              <input
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Evidence reference (IPFS CID / link)"
                className="w-72 rounded-lg border border-line bg-navy-900 px-3 py-2 text-sm text-white placeholder:text-mist"
              />
              <TxButton
                label={`Raise dispute (${formatBnb(fee)})`}
                disabled={!evidence.trim()}
                title={`Open a dispute. You pay the dispute fee of ${formatBnb(fee)} in BNB with this transaction; the escrow forwards it to the court.`}
                prepare={() => ({
                  address: CONTRACTS.jobEscrow,
                  abi: JobEscrowAbi,
                  functionName: "raiseDispute",
                  args: [id, hashString(evidence.trim())],
                  value: fee,
                })}
              />
            </span>
          </>
        )}
        {job.status === 3 && isWorker && (
          <TxButton
            label="Claim after review timeout"
            disabled={now <= Number(job.reviewDeadline)}
            title="The client stayed silent past the review window — claim the payment."
            prepare={() => ({
              address: CONTRACTS.jobEscrow,
              abi: JobEscrowAbi,
              functionName: "claimAfterTimeout",
              args: [id],
            })}
          />
        )}
        {job.status === 2 && isClient && (
          <TxButton
            label="Reclaim undelivered (after deadline)"
            disabled={now <= Number(job.workDeadline)}
            title="The worker accepted but never delivered past the deadline — reclaim the escrow."
            prepare={() => ({
              address: CONTRACTS.jobEscrow,
              abi: JobEscrowAbi,
              functionName: "reclaimUndelivered",
              args: [id],
            })}
          />
        )}
        {job.status === 1 && isClient && (
          <TxButton
            label="Cancel job"
            title="Cancel an open job and reclaim the escrow."
            prepare={() => ({
              address: CONTRACTS.jobEscrow,
              abi: JobEscrowAbi,
              functionName: "cancelJob",
              args: [id],
            })}
            className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          />
        )}
        {job.status === 4 && isWorker && (
          <TxButton
            label={`Match dispute fee (${formatBnb(fee)})`}
            title={`Match the client's dispute fee of ${formatBnb(fee)} in BNB. This activates the case and the jury draw.`}
            prepare={() => ({
              address: CONTRACTS.jobEscrow,
              abi: JobEscrowAbi,
              functionName: "matchDispute",
              args: [id],
              value: fee,
            })}
          />
        )}
        {job.status === 4 && now > Number(job.matchDeadline) && (
          <TxButton
            label="Default judgment (worker never matched)"
            title="The worker never matched the dispute fee — the client wins by default."
            prepare={() => ({
              address: CONTRACTS.jobEscrow,
              abi: JobEscrowAbi,
              functionName: "defaultJudgment",
              args: [id],
            })}
          />
        )}
        {job.status === 5 && caseData.phase === 2 && (
          <TxButton
            label="Draw jurors"
            title="Anyone can trigger the draw once the target block has passed. Five Agent ID holders are picked, excluding the parties."
            prepare={() => ({
              address: CONTRACTS.juryCourt,
              abi: JuryCourtAbi,
              functionName: "drawJurors",
              args: [id],
            })}
          />
        )}
        {job.status === 5 && caseData.phase === 3 && (
          <TxButton
            label="Finalize verdict"
            disabled={
              now <= Number(caseData.revealEnd) && caseData.revealed < 5
            }
            title="Finalize once all five jurors revealed or the reveal window closed. Executes the verdict and pays jurors."
            prepare={() => ({
              address: CONTRACTS.juryCourt,
              abi: JuryCourtAbi,
              functionName: "finalize",
              args: [id],
            })}
          />
        )}
        {job.status === 5 && caseData.phase === 2 && (
          <TxButton
            label="Abort stale case"
            title="If no jury could be drawn within the draw timeout, split everything and refund both fees."
            prepare={() => ({
              address: CONTRACTS.juryCourt,
              abi: JuryCourtAbi,
              functionName: "abortStaleCase",
              args: [id],
            })}
            className="rounded-lg border border-line bg-navy-900 px-4 py-2 text-sm font-semibold text-mist transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          />
        )}
      </div>

      {!address && (
        <p className="mt-3 text-xs text-mist">
          Connect a wallet to take actions on this job.
        </p>
      )}
      {job.status === 1 && !isClient && !address && (
        <p className="mt-1 text-xs text-mist">
          Accepting a job requires an Agent ID.
        </p>
      )}
      {job.status === 1 && isClient && (
        <p className="mt-3 text-xs text-mist">
          Waiting for a worker agent to accept. You can cancel and reclaim
          the escrow while the job is open.
        </p>
      )}
    </div>
  );
}

// Re-exported for the hire page so the value conversion stays in one place.
export function bnbToWei(bnb: string): bigint {
  return parseEther(bnb);
}
