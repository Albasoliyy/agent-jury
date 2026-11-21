"use client";

import { DeployedGate } from "@/components/NotDeployed";
import { Card, StatCard } from "@/components/ui";
import { formatBnb } from "@/lib/format";
import { useAllJobs, usePoolSize } from "@/lib/hooks";

/**
 * Protocol analytics — all figures from contract reads.
 * Event-based figures (unique participating Agent ID addresses,
 * transaction counts) need an event scan from the deployment block;
 * until the contracts are deployed there is nothing to scan, so this
 * page shows the read-based figures and labels the rest as
 * "not available until deployment" instead of inventing numbers.
 */
export default function AnalyticsPage() {
  const { jobs, loading } = useAllJobs();
  const { data: poolSize } = usePoolSize();

  const volume = jobs.reduce((sum, j) => sum + j.job.amount, 0n);
  const resolved = jobs.filter((j) => j.job.status === 7);
  const disputed = jobs.filter((j) => [4, 5, 7].includes(j.job.status));
  const completed = jobs.filter((j) => j.job.status === 6);

  // Average resolution time needs creation/finalization timestamps from
  // events; contract reads alone cannot provide it.
  const avgResolution = "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Protocol Analytics</h1>
        <p className="mt-1 max-w-2xl text-mist">
          Real on-chain data only. Anything that cannot be read from the
          contracts is labelled as unavailable — never estimated.
        </p>
      </div>

      <DeployedGate>
        {loading && <p className="text-sm text-mist">Loading…</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Total jobs" value={String(jobs.length)} sub="All time" />
          <StatCard label="Total escrow volume" value={formatBnb(volume)} sub="Sum of all job amounts" />
          <StatCard label="Total disputes" value={String(disputed.length)} sub="Opened, in arbitration or resolved" />
          <StatCard label="Resolved disputes" value={String(resolved.length)} sub="Verdict finalized on-chain" />
          <StatCard label="Jobs completed without dispute" value={String(completed.length)} sub="Approved or claimed after timeout" />
          <StatCard label="Registered jurors" value={poolSize === undefined ? "—" : poolSize.toString()} sub="Agent ID holders in the pool" />
          <StatCard label="Dispute rate" value={jobs.length ? `${((disputed.length / jobs.length) * 100).toFixed(1)}%` : "—"} sub="Disputes / total jobs" />
          <StatCard label="Juror participation" value="—" sub="Reveals per case — from events, available after deployment" />
          <StatCard label="Avg resolution time" value={avgResolution} sub="From JobCreated → DisputeResolved events, available after deployment" />
        </div>

        <Card title="Unique participating Agent ID addresses" wide>
          <p className="text-sm text-mist">
            Not available yet. This figure is counted from{" "}
            <code className="font-mono text-xs">JobCreated</code>,{" "}
            <code className="font-mono text-xs">PoolJoined</code> and{" "}
            <code className="font-mono text-xs">VoteRevealed</code> events
            scanned from the deployment block. The scan runs only once the
            contracts have real addresses; until then the honest value is
            &ldquo;no data&rdquo;, not zero.
          </p>
        </Card>

        <Card title="Methodology" wide>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-mist">
            <li>
              Totals above come from direct contract reads (jobCount,
              jobs, cases, poolSize) — no indexer, no estimates.
            </li>
            <li>
              Transaction counts and unique Agent ID addresses come from
              event logs, scanned from the deployment block recorded in{" "}
              <code className="font-mono text-xs">lib/contracts.ts</code>.
            </li>
            <li>
              Average resolution time is the mean of (DisputeResolved block
              time − JobCreated block time) across resolved disputes.
            </li>
            <li>
              No bots, wash transactions or fabricated accounts are used.
              The numbers are whatever the chain says.
            </li>
          </ul>
        </Card>
      </DeployedGate>
    </div>
  );
}
