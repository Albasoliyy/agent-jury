import { CASE_PHASE, JOB_STATUS } from "@/lib/contracts";

const JOB_COLORS: Record<number, string> = {
  1: "border-electric-500/40 bg-electric-500/10 text-electric-400",
  2: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  3: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  4: "border-red-500/40 bg-red-500/10 text-red-400",
  5: "border-red-500/40 bg-red-500/10 text-red-400",
  6: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  7: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  8: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  9: "border-slate-500/40 bg-slate-500/10 text-slate-400",
};

export function JobStatusBadge({ status }: { status: number }) {
  const color =
    JOB_COLORS[status] ??
    "border-slate-500/40 bg-slate-500/10 text-slate-400";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${color}`}
    >
      {JOB_STATUS[status] ?? "Unknown"}
    </span>
  );
}

export function CasePhaseBadge({ phase }: { phase: number }) {
  const color =
    phase === 3
      ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
      : phase === 4
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
        : phase === 5
          ? "border-slate-500/40 bg-slate-500/10 text-slate-400"
          : "border-electric-500/40 bg-electric-500/10 text-electric-400";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${color}`}
    >
      {CASE_PHASE[phase] ?? "Unknown"}
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-navy-800 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-mist">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-mist">{sub}</p>}
    </div>
  );
}

export function Card({
  title,
  children,
  wide,
}: {
  title?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-navy-800 p-5 ${
        wide ? "md:col-span-2" : ""
      }`}
    >
      {title && (
        <h2 className="mb-4 text-base font-semibold text-white">{title}</h2>
      )}
      {children}
    </section>
  );
}
