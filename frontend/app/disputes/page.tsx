"use client";

import { DeployedGate } from "@/components/NotDeployed";
import { JobCard } from "@/components/JobCard";
import { Card } from "@/components/ui";
import { useAllJobs, useDisputeFee, useJurors } from "@/lib/hooks";
import { shortAddress } from "@/lib/format";

function JurorList({ jobId }: { jobId: bigint }) {
  const { data } = useJurors(jobId);
  if (!data || data.length === 0) return null;
  return (
    <p className="mt-2 text-sm text-mist">
      Jurors:{" "}
      {data.map((j) => (
        <code key={j} className="mr-2 font-mono text-xs text-slate-200">
          {shortAddress(j)}
        </code>
      ))}
    </p>
  );
}

export default function DisputesPage() {
  const { jobs, loading } = useAllJobs();
  const { data: disputeFee } = useDisputeFee();

  const active = jobs.filter((j) => [4, 5].includes(j.job.status));
  const resolved = jobs.filter((j) => j.job.status === 7);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Dispute Center</h1>
        <p className="mt-1 max-w-2xl text-mist">
          Every dispute, its evidence reference, jury status, voting
          progress and final verdict, read from the contracts. Evidence
          itself is never stored on-chain: only its hash is.
        </p>
      </div>

      <DeployedGate>
        {loading && <p className="text-sm text-mist">Loading disputes…</p>}

        <Card title={`Active disputes (${active.length})`} wide>
          {active.length === 0 && !loading && (
            <p className="text-sm text-mist">
              No active disputes. A dispute opens when a client contests
              submitted work (Disputed) and goes to the jury once the worker
              matches the dispute fee (Arbitration).
            </p>
          )}
          <div className="space-y-4">
            {active.map((j) => (
              <div key={j.id.toString()}>
                <JobCard
                  id={j.id}
                  job={j.job}
                  caseData={j.case}
                  disputeFee={disputeFee}
                />
                <JurorList jobId={j.id} />
              </div>
            ))}
          </div>
        </Card>

        <Card title={`Finalized verdicts (${resolved.length})`} wide>
          {resolved.length === 0 && !loading && (
            <p className="text-sm text-mist">
              No resolved disputes yet. Finalized verdicts appear here with
              their outcome and the jurors who voted.
            </p>
          )}
          <div className="space-y-4">
            {resolved.map((j) => (
              <div key={j.id.toString()}>
                <JobCard
                  id={j.id}
                  job={j.job}
                  caseData={j.case}
                  disputeFee={disputeFee}
                />
                <JurorList jobId={j.id} />
              </div>
            ))}
          </div>
        </Card>

        <Card title="How a dispute is decided">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-mist">
            <li>
              The client raises a dispute inside the review window and pays
              the dispute fee in BNB. The worker has the match window to pay
              the same fee; if they do not, the client wins by default.
            </li>
            <li>
              Five jurors are drawn at random from the Agent ID holder pool, never the parties, never twice in one case. Anyone can
              trigger the draw once the target block has passed.
            </li>
            <li>
              Jurors commit a hash of their vote, then reveal vote + salt.
              Quorum is 3 of 5 reveals; a majority wins; fewer than 3
              reveals or a tie splits the escrow 50/50 and refunds both
              fees.
            </li>
            <li>
              Finalize executes the verdict: the winner&apos;s share becomes
              claimable, jurors who voted with the majority split the
              loser&apos;s fee, and reputation records update on-chain.
            </li>
          </ol>
        </Card>
      </DeployedGate>
    </div>
  );
}
