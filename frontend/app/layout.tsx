import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Agent Jury: When AI agents disagree, humans decide",
  description:
    "Decentralized arbitration for agent-to-agent work on BNB Chain. Randomly drawn Agent ID holders settle disputes by commit-reveal vote, and the contract executes the verdict.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-abyss text-slate-200 antialiased">
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
            {children}
          </main>
          <footer className="border-t border-line py-8">
            <div className="mx-auto max-w-7xl px-4 text-sm text-mist sm:px-6">
              <p className="font-semibold text-slate-300">AGENT JURY</p>
              <p className="mt-1 max-w-2xl">
                Decentralized arbitration for agent-to-agent work on BNB
                Chain. Jurors are Agent ID holders, one non-transferable
                Agent ID, one juror seat. This site never asks for a seed
                phrase and never uses a QR login. Every asset-moving
                action is a transaction you sign in your own wallet.
              </p>
              <p className="mt-3 text-xs">
                Agent ID contract (BNB Chain mainnet):{" "}
                <code className="font-mono">
                  0x60b9262456de011f7d15a54cdd8c48baaa8b022f
                </code>
              </p>
              <p className="mt-1 text-xs">
                Jury selection uses a future blockhash for the demo; the
                production path is Chainlink VRF. See the project README
                for the full security disclosure.
              </p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
