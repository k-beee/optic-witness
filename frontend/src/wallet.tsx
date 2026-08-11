import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useCallback } from "react";
import { motion } from "framer-motion";
import { getWriteClient } from "./lib/genlayer";
import { formatAddress } from "./lib/format";
import type { GenLayerClient } from "genlayer-js/types";

export interface Wallet {
  ready: boolean;
  authenticated: boolean;
  address?: `0x${string}`;
  login: () => void;
  logout: () => void;
  getClient: () => Promise<GenLayerClient<never>>;
}

export function useWallet(): Wallet {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const address = wallet?.address as `0x${string}` | undefined;

  const getClient = useCallback(async () => {
    if (!wallet || !address) throw new Error("Wallet provider offline");
    const provider = await wallet.getEthereumProvider();
    return (await getWriteClient(address, provider)) as unknown as GenLayerClient<never>;
  }, [wallet, address]);

  return { ready, authenticated, address, login, logout, getClient };
}

export function WalletButton() {
  const { ready, authenticated, address, login, logout } = useWallet();

  if (!ready) {
    return <span className="text-loading">Init...</span>;
  }
  if (!authenticated || !address) {
    return (
      <motion.button
        className="button-primary"
        onClick={login}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        Sign In
      </motion.button>
    );
  }
  return (
    <motion.div
      className="wallet-row"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <span className="wallet-badge">
        <span className="badge-glow" />
        {formatAddress(address, 4)}
      </span>
      <button className="button-link" onClick={logout}>
        Log Out
      </button>
    </motion.div>
  );
}
