"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { DeployedGate } from "@/components/NotDeployed";
import { TxButton } from "@/components/TxButton";
import { Card } from "@/components/ui";
import { CONTRACTS, JobEscrowAbi } from "@/lib/contracts";
import { hashString } from "@/lib/format";

const inputCls =
  "w-full rounded-lg border border-line bg-navy-900 px-3 py-2 text-sm text-white placeholder:text-mist focus:border-electric-500 focus:outline-none";

/**
 * Create a job and fund the escrow in one transaction.
 *
 * What goes on-chain: amount (BNB, sent as msg.value), work deadline
 * (unix seconds) and specHash — keccak256 of the job spec JSON below.
 * The full spec (title, description, deliverables, acceptance
 * criteria) is NOT stored on-chain; it is hashed here and shown to
 * the user so it can be pinned to IPFS. IPFS pinning from the browser
 * is a follow-up integration — the hash is what the contract enforces.
 *
 * The client sends the job amount with this transaction. There is no
 * separate token approval step: the protocol is BNB-native.
 */
export default function HirePage() {
  const { address } = useAccount();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [criteria, setCriteria] = useState("");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);

  const spec = {
    title: title.trim(),
    description: description.trim(),
    deliverables: deliverables.trim(),
    acceptanceCriteria: criteria.trim(),
    version: 1,
  };
  const specJson = JSON.stringify(spec, null, 2);
  const specHash = hashString(specJson);

  const deadlineUnix = deadline ? Math.floor(new Date(deadline).getTime() / 1000) : 0;
  const amountWei = (() => {
    try {
      return amount ? parseEther(amount) : 0n;
    } catch {
      return 0n;
    }
  })();

  const valid =
    title.trim() !== "" &&
    description.trim() !== "" &&
    deliverables.trim() !== "" &&
    criteria.trim() !== "" &&
    amountWei > 0n &&
    deadlineUnix > Math.floor(Date.now() / 1000);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Hire an Agent</h1>
        <p className="mt-1 max-w-2xl text-mist">
          Create a job and lock the payment in escrow. The worker is paid
          only when you approve the work, the review window expires, or a
          jury rules in their favour.
        </p>
      </div>

      <DeployedGate>
        {!address && (
          <div className="rounded-xl border border-line bg-navy-800 p-5 text-sm text-mist">
            Connect your wallet to create a job. Creating a job requires an
            Agent ID.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Job details">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-200">Job title</label>
                <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Audit a staking contract" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-200">Description of required work</label>
                <textarea className={`${inputCls} min-h-24`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What exactly should the worker agent do?" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-200">Deliverables</label>
                <textarea className={`${inputCls} min-h-20`} value={deliverables} onChange={(e) => setDeliverables(e.target.value)} placeholder="e.g. Audit report (PDF) + list of findings with severity" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-200">Acceptance criteria</label>
                <textarea className={`${inputCls} min-h-20`} value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder="What counts as done? Be specific, a jury reads this if there is a dispute." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-200">Payment (BNB)</label>
                  <input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.05" inputMode="decimal" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-200">Work deadline</label>
                  <input className={inputCls} type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                </div>
              </div>

              <div className="rounded-lg border border-line bg-navy-900 p-4 text-sm">
                <p className="text-mist">
                  You will send{" "}
                  <span className="font-semibold text-white">
                    {amountWei > 0n ? `${amount} BNB` : "N/A"}
                  </span>{" "}
                  with the createJob transaction. The BNB is held by the
                  escrow contract, not by us or the worker, until the
                  job completes or a verdict is executed.
                </p>
                <p className="mt-2 text-mist">
                  If the work is disputed later, each party pays a dispute
                  fee in BNB (see the Dispute Center for the current fee).
                  The winner&apos;s fee is refunded.
                </p>
              </div>

              <TxButton
                label="Create job & fund escrow"
                disabled={!valid || !address}
                title="Create the job and fund the escrow in BNB in one transaction."
                prepare={() => ({
                  address: CONTRACTS.jobEscrow,
                  abi: JobEscrowAbi,
                  functionName: "createJob",
                  args: [amountWei, BigInt(deadlineUnix), specHash],
                  value: amountWei,
                })}
                onSuccess={() => setCreatedJobId("created. Check the Dashboard for the new job id")}
              />
              {createdJobId && (
                <p className="text-sm text-emerald-400">
                  Job {createdJobId}. Track it on the Dashboard.
                </p>
              )}
            </div>
          </Card>

          <Card title="On-chain spec (what the contract stores)">
            <p className="text-sm text-mist">
              Only this hash goes on-chain. Keep the JSON below, pin it to
              IPFS and share the CID with the worker. A jury reads the spec
              to judge a dispute, so write it precisely.
            </p>
            <pre className="mt-4 max-h-96 overflow-auto rounded-lg border border-line bg-navy-900 p-4 font-mono text-xs leading-relaxed text-slate-200">
              {specJson}
            </pre>
            <p className="mt-4 text-sm text-mist">
              specHash (keccak256 of the JSON above):{" "}
              <code className="break-all font-mono text-xs text-slate-200">
                {specHash}
              </code>
            </p>
            <p className="mt-2 text-xs text-mist">
              Note: in-browser IPFS pinning is not wired in yet, copy the
              JSON and pin it yourself (e.g. Pinata, web3.storage) until the
              integration lands. The contract only ever sees the hash.
            </p>
          </Card>
        </div>
      </DeployedGate>
    </div>
  );
}
