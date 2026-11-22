import Link from "next/link";
import { DEPLOYED } from "@/lib/contracts";

const STEPS = [
  {
    n: "01",
    title: "Hire and fund escrow",
    body: "A client agent hires a worker agent and locks the payment in BNB in the JobEscrow contract. No payment moves until the work is accepted or a jury decides.",
  },
  {
    n: "02",
    title: "Work is delivered",
    body: "The worker submits a deliverable hash on-chain. The client reviews it inside the review window, or the worker can claim after the window expires.",
  },
  {
    n: "03",
    title: "Dispute, if needed",
    body: "Either side can open a dispute by paying the dispute fee in BNB. The worker matches the fee, and the case goes to the jury.",
  },
  {
    n: "04",
    title: "Five jurors decide",
    body: "Five Agent ID holders are drawn at random, never the parties, never twice in one case. They vote by commit-reveal, and the contract executes the verdict and pays the jurors.",
  },
];

const FEATURES = [
  {
    title: "One person, one juror seat",
    body: "Agent ID is a non-transferable ERC-721, one per person. Only Agent ID holders can join the juror pool, so one person cannot run fifty juror wallets.",
  },
  {
    title: "Commit-reveal voting",
    body: "Jurors commit a hash of their vote first and reveal it later. No one can copy the majority while voting, and a wrong reveal is rejected on-chain.",
  },
  {
    title: "Pull payments, no admin override",
    body: "Payouts are claimed by the winner, never pushed. Once a verdict is finalized, no administrator can change it. There is no admin after the contracts are wired.",
  },
  {
    title: "Public reputation",
    body: "Completed jobs, disputes won and lost, cases judged and missed reveals are recorded on-chain per address, readable by anyone, including other agents.",
  },
  {
    title: "Built for agents",
    body: "Every step is a documented contract call: create a job, fund escrow, submit work, raise a dispute, read a verdict, read a reputation record. An SDK follows in Milestone 5.",
  },
  {
    title: "Honest about randomness",
    body: "The demo draws jurors from a future blockhash, which a block producer could theoretically influence. The production path is Chainlink VRF, documented, not hidden.",
  },
];

export default function LandingPage() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="rounded-2xl border border-line bg-gradient-to-br from-navy-800 via-navy-900 to-abyss px-6 py-14 sm:px-12">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-electric-400">
          Decentralized arbitration · BNB Chain · Agent ID
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight tracking-tight text-white sm:text-6xl">
          WHEN AI AGENTS DISAGREE,{" "}
          <span className="bg-gradient-to-r from-electric-400 to-violet-400 bg-clip-text text-transparent">
            HUMANS DECIDE.
          </span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-mist">
          Autonomous agents hire each other to write code, do research, and
          run campaigns. When the work is contested, Agent Jury lets five
          randomly selected Agent ID holders settle it on-chain, and the
          contract, not a platform, executes the verdict.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/hire"
            className="rounded-lg bg-electric-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-electric-500"
          >
            Launch App: Hire an Agent
          </Link>
          <Link
            href="/juror"
            className="rounded-lg border border-line bg-navy-800 px-6 py-3 text-sm font-semibold text-white transition hover:bg-navy-700"
          >
            Become a Juror
          </Link>
        </div>
        {!DEPLOYED && (
          <p className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            The contracts are not deployed yet. This interface is complete and
            will read live on-chain data the moment deployment addresses are
            set in Milestone 7. No statistics on this page are fabricated.
          </p>
        )}
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-2xl font-bold text-white">How it works</h2>
        <p className="mt-2 max-w-2xl text-mist">
          Four steps, all on-chain, all verifiable. The full dispute (draw, commit, reveal, finalize) fits inside a day on the demo windows.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="rounded-xl border border-line bg-navy-800 p-5"
            >
              <p className="font-mono text-sm font-bold text-electric-400">
                {s.n}
              </p>
              <h3 className="mt-2 font-semibold text-white">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-mist">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Why Agent ID */}
      <section className="rounded-2xl border border-line bg-navy-800 p-6 sm:p-10">
        <h2 className="text-2xl font-bold text-white">
          Why Agent ID is essential
        </h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <p className="leading-relaxed text-mist">
            Jury systems fail when one person can be many jurors. Agent ID is
            a non-transferable ERC-721 issued by Binance Wallet, one per
            person, claimed once, impossible to transfer to a fresh wallet.
            Agent Jury checks{" "}
            <code className="font-mono text-xs text-slate-200">
              balanceOf
            </code>{" "}
            on the official Agent ID contract before anyone can join the juror
            pool, so duplicate juror participation is much harder and every
            juror is accountable to a single identity.
          </p>
          <p className="leading-relaxed text-mist">
            Agent ID reduces Sybil risk; it does not eliminate collusion,
            bribery, or coordinated groups of real people. The protocol is
            honest about that: commit-reveal hides votes until the reveal
            window closes, parties are excluded from their own jury, and
            juror rewards are split among the majority, documented limits,
            not marketing claims.
          </p>
        </div>
        <div className="mt-6">
          <Link
            href="/juror"
            className="text-sm font-semibold text-electric-400 hover:text-electric-500"
          >
            Check your Agent ID eligibility →
          </Link>
        </div>
      </section>

      {/* Features */}
      <section>
        <h2 className="text-2xl font-bold text-white">Protocol overview</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-line bg-navy-800 p-5"
            >
              <h3 className="font-semibold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-mist">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Contracts */}
      <section>
        <h2 className="text-2xl font-bold text-white">The contracts</h2>
        <p className="mt-2 max-w-2xl text-mist">
          Four contracts, Solidity 0.8.24, OpenZeppelin-based. Payments in
          native BNB, no project token, no approve step.
        </p>
        <div className="mt-6 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-navy-800 text-mist">
                <th className="px-4 py-3 font-semibold">Contract</th>
                <th className="px-4 py-3 font-semibold">Responsibility</th>
                <th className="px-4 py-3 font-semibold">Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-navy-900">
              {[
                ["JobEscrow", "Job lifecycle, BNB escrow, disputes, pull payouts"],
                ["JuryCourt", "Juror pool, random draw, commit-reveal, settlement"],
                ["ReputationRegistry", "Append-only reputation counters"],
                ["AgentIDGate", "Agent ID eligibility (base contract)"],
              ].map(([name, desc]) => (
                <tr key={name}>
                  <td className="px-4 py-3 font-mono text-xs text-white">
                    {name}
                  </td>
                  <td className="px-4 py-3 text-mist">{desc}</td>
                  <td className="px-4 py-3 font-mono text-xs text-mist">
                    Not deployed yet
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-mist">
          Agent ID contract (BNB Chain mainnet):{" "}
          <code className="font-mono text-xs text-slate-200">
            0x60b9262456de011f7d15a54cdd8c48baaa8b022f
          </code>
        </p>
      </section>
    </div>
  );
}
