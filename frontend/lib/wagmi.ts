import { createConfig, http } from "wagmi";
import { bsc, bscTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * wagmi config.
 *
 * Chains: BNB Chain Testnet first (the Milestone 7 deploy target),
 * then BNB Chain Mainnet. Wallet connection is the standard
 * injected-wallet path (MetaMask, Binance Wallet extension, etc.).
 * There is deliberately NO QR-code login on this site and no
 * WalletConnect project — the site never asks for a seed phrase.
 */
export const config = createConfig({
  chains: [bscTestnet, bsc],
  transports: {
    [bscTestnet.id]: http(),
    [bsc.id]: http(),
  },
  connectors: [injected()],
  ssr: true,
});
