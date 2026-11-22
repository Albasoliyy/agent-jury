"use client";

import { useAccount } from "wagmi";
import { DeployedGate } from "@/components/NotDeployed";
import { TxButton } from "@/components/TxButton";
import { JobCard } from "@/components/JobCard";
import { Card, StatCard } from "@/components/ui";
import { CONTRACTS, JobEscrowAbi, JuryCourtAbi } from "@/lib/contracts";
import { formatBnb, shortAddress } from "@/lib/format";
import {
  useAllJobs,
  useCourtClaimable,
  useDisputeFee,
  useEscrowClaimable,
  usePoolSize,
} from "@/lib/hooks";

export default function DashboardPage() {
  const { address } = useAccount();
  const { jobs, loading } = useAllJobs();
  const { data: poolSize } = usePoolSize();
  const { data: disputeFee } = useDisputeFee();
  const { data: escrowClaimable } = useEscrowClaimable(address);
  const { data: courtClaimable } = useCourtClaimable(address);

  const activeEscrows = jobs.filter((j) => [1, 2, 3].includes(j.job.status));
  const activeDisputes = jobs.filter((j) => [4, 5].includes(j.job.status));
  const completed = jobs.filter((j) => [6, 7].includes(j.job.status));
  const volume = jobs.reduce((sum, j) => sum + j.job.amount, 0n);
  const myJobs = address
    ? jobs.filter(
        (j) =>
          j.job.client.toLowerCase() === address.toLowerCase() ||
          j.job.worker.toLowerCase() === address.toLowerCase(),
      )
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-mist">
          Live protocol totals, read from the contracts. Nothing here is
          estimated or invented.
        </p>
      </div>

      <DeployedGate>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Total jobs" value={String(jobs.length)} sub={loading ? "Loading…" : "on-chain, all time"} />
          <StatCard label="Active escrows" value={String(activeEscrows.length)} sub="Open, accepted or submitted" />
          <StatCard label="Active disputes" value={String(activeDisputes.length)} sub="Disputed or in arbitration" />
          <StatCard label="Completed arbitrations" value={String(completed.length)} sub="Completed or resolved jobs" />
          <StatCard label="Total escrow volume" value={formatBnb(volume)} sub="Sum of all job amounts" />
          <StatCard label="Registered jurors" value={poolSize === undefined ? "N/A" : poolSize.toString()} sub="Agent ID holders in the pool" />
        </div>

        {address && (
          <Card title="Your claimable balance">
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-sm text-mist">
                Escrow:{" "}
                <span className="font-semibold text-white">
                  {formatBnb(escrowClaimable)}
                </span>{" "}
                · Jury court:{" "}
                <span className="font-semibold text-white">
                  {formatBnb(courtClaimable)}
                </span>
              </p>
              {(escrowClaimable ?? 0n) > 0n && (
                <TxButton
                  label="Withdraw from escrow"
                  title="Pull your claimable BNB from the escrow contract."
                  prepare={() => ({
                    address: CONTRACTS.jobEscrow,
                    abi: JobEscrowAbi,
                    functionName: "withdraw",
                  })}
                />
              )}
              {(courtClaimable ?? 0n) > 0n && (
                <TxButton
                  label="Withdraw juror rewards"
                  title="Pull your claimable BNB (fees / juror rewards) from the court."
                  prepare={() => ({
                    address: CONTRACTS.juryCourt,
                    abi: JuryCourtAbi,
                    functionName: "withdraw",
                  })}
                />
              )}
              {(escrowClaimable ?? 0n) === 0n &&
                (courtClaimable ?? 0n) === 0n && (
                  <p className="text-sm text-mist">
                    Nothing claimable right now for {shortAddress(address)}.
                  </p>
                )}
            </div>
          </Card>
        )}

        <Card title={address ? "Your jobs" : "Recent jobs"} wide>
          {loading && <p className="text-sm text-mist">Loading jobs…</p>}
          {!loading && myJobs.length === 0 && address && (
            <p className="text-sm text-mist">
              You have no jobs yet.{" "}
              <a href="/hire" className="font-semibold text-electric-400">
                Hire an agent →
              </a>
            </p>
          )}
          {!loading && jobs.length === 0 && !address && (
            <p className="text-sm text-mist">No jobs created yet.</p>
          )}
          <div className="space-y-4">
            {(address ? myJobs : jobs.slice(-5).reverse()).map((j) => (
              <JobCard
                key={j.id.toString()}
                id={j.id}
                job={j.job}
                caseData={j.case}
                disputeFee={disputeFee}
              />
            ))}
          </div>
        </Card>
      </DeployedGate>
    </div>
  );
}
