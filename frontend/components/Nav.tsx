"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/hire", label: "Hire an Agent" },
  { href: "/disputes", label: "Dispute Center" },
  { href: "/juror", label: "Become a Juror" },
  { href: "/reputation", label: "Reputation" },
  { href: "/analytics", label: "Analytics" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-abyss/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-electric-600 to-violet-500 text-base font-black text-white">
            AJ
          </span>
          <span className="text-lg font-bold tracking-tight text-white">
            AGENT JURY
          </span>
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-x-1 gap-y-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                pathname === l.href
                  ? "bg-navy-700 text-white"
                  : "text-mist hover:bg-navy-800 hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <ConnectButton
          showBalance={false}
          accountStatus="address"
          chainStatus="icon"
        />
      </div>
    </header>
  );
}
