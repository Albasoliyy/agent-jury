import { DEPLOYED } from "@/lib/contracts";

/** Shown on every data page until the contracts are deployed. */
export function NotDeployed() {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
      <p className="font-semibold text-amber-300">
        Contracts not deployed yet
      </p>
      <p className="mt-1 text-sm text-mist">
        The Agent Jury contracts have not been deployed to BNB Chain yet, so
        there is no live data to show here. Deployment addresses will be
        added to <code className="font-mono text-xs">lib/contracts.ts</code>{" "}
        in Milestone 7, after which this page reads real on-chain data.
        Nothing on this page is fabricated.
      </p>
    </div>
  );
}

export function DeployedGate({ children }: { children: React.ReactNode }) {
  if (!DEPLOYED) return <NotDeployed />;
  return <>{children}</>;
}
