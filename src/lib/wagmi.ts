import { createConfig, http } from "wagmi";
import { base, baseSepolia, mainnet, sepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [mainnet, base, baseSepolia, sepolia],
  connectors: [
    injected(),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "vestr-dev",
    }),
  ],
  transports: {
    [mainnet.id]:     http(),
    [base.id]:        http(),
    [baseSepolia.id]: http(),
    [sepolia.id]:     http(),
  },
});
