"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { DeployedGate } from "@/components/NotDeployed";
import { Card, StatCard } from "@/components/ui";
import { checkAgentID, useReputation } from "@/lib/hooks";
import { shortAddress } from "@/lib/format";

const inputCls =
  "w-full rounded-lg border border-line bg-navy-900 px-3 py-2 font-mono text-sm text-white placeholder:text-mist focus:border-electric-500 focus:outline-none";

/**
 * Public reputation explorer. Looks up a record BY wallet address.
 * There is deliberately no Agent ID name-to-wallet lookup anywhere
 * in this app.
 */
export default function ReputationPage() {
  const { address: connected } = useAccount();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<`0x${string}` | null>(null);
  const [hasID, setHasID] = useState<boolean | null>(null);

  const { data: record } = useReputation(target ?? undefined);

  useEffect(() => {
    if (!target) {
      setHasID(null);
      return;
    }
    checkAgentID(target).then(setHasID).catch(() => setHasID(null));
  }, [target]);

  const valid =
    /^0x[0-9a-fA-F]{40}$/.test(query.trim()) && query.trim() !== "";

  const r = record ?? undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Reputation Explorer</h1>
        <p className="mt-1 max-w-2xl text-mist">
          Public, on-chain reputation for any wallet: completed jobs,
          disputes won and lost, cases judged, missed reveals. Losing a
          dispute is recorded as a fact, it is not, by itself, proof of
          dishonesty.
        </p>
      </div>

      <Card title="Look up a wallet">
        <div className="flex flex-wrap gap-2">
          <input
            className={`${inputCls} max-w-xl flex-1`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="0x… wallet address"
          />
          <button
            type="button"
            disabled={!valid}
            onClick={() => setTarget(query.trim() as `0x${string}`)}
            className="rounded-lg bg-electric-600 px-4 py-2 text-sm font-semibold text-white hover:bg-electric-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Look up
          </button>
          {connected && (
            <button
              type="button"
              onClick={() => {
                setQuery(connected);
                setTarget(connected);
              }}
              className="rounded-lg border border-line bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
            >
              My record
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-mist">
          Lookup is by wallet address only. Agent Jury does not provide an
          Agent ID name-to-wallet lookup.
        </p>
      </Card>

      {target && (
        <DeployedGate>
          <Card title={`Profile: ${shortAddress(target)}`} wide>
            <p className="mb-4 break-all font-mono text-xs text-mist">
              {target}
            </p>
            <p className="mb-4 text-sm">
              Agent ID:{" "}
              {hasID === null ? (
                <span className="text-mist">checking…</span>
              ) : hasID ? (
                <span className="font-semibold text-emerald-400">
                  Holds an Agent ID
                </span>
              ) : (
                <span className="font-semibold text-amber-300">
                  No Agent ID held
                </span>
              )}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Jobs completed" value={r ? String(r.jobsCompleted) : "N/A"} sub="As client or worker" />
              <StatCard label="Disputes won" value={r ? String(r.disputesWon) : "N/A"} />
              <StatCard label="Disputes lost" value={r ? String(r.disputesLost) : "N/A"} />
              <StatCard label="Disputes split" value={r ? String(r.disputesSplit) : "N/A"} />
              <StatCard label="Cases judged" value={r ? String(r.casesJudged) : "N/A"} sub="As a juror" />
              <StatCard label="Majority votes" value={r ? String(r.majorityVotes) : "N/A"} sub="Reveals matching the verdict" />
              <StatCard label="Missed reveals" value={r ? String(r.missedReveals) : "N/A"} sub="Commits never revealed" />
              <StatCard
                label="Juror reliability"
                value={
                  r && r.casesJudged + r.missedReveals > 0
                    ? `${Math.round(
                        (r.casesJudged / (r.casesJudged + r.missedReveals)) * 100,
                      )}%`
                    : "N/A"
                }
                sub="Revealed / (revealed + missed)"
              />
            </div>
            <p className="mt-4 text-xs text-mist">
              Records are append-only and written only by the escrow and
              court contracts. No administrator can edit them.
            </p>
          </Card>
        </DeployedGate>
      )}
    </div>
  );
}
