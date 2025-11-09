/**
 * Refactored Web3 Context
 * Simplified version following Pacto P2P patterns
 * Uses Zustand store and custom hooks instead of managing everything in context
 */

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { getCurrentNetwork } from "@/lib/web3/stellar-config";
import useWalletStore from "@/store/wallet.store";
import { useWalletRefactored } from "@/hooks/use-wallet-refactored";
import { contractService } from "@/lib/web3/contract-service";
import { useToast } from "@/hooks/use-toast";
import storage from "@/util/storage";
import { wallet } from "@/util/wallet";
import { fetchBalance } from "@/util/wallet";

interface Web3ContextType {
  wallet: {
    address: string | null;
    isConnected: boolean;
    balance: string;
    network: string;
  };
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  getContract: () => typeof contractService;
  network: ReturnType<typeof getCurrentNetwork>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3ProviderRefactored({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    address,
    isConnected,
    balance,
    network: networkName,
  } = useWalletStore();
  const { connectWallet, disconnectWallet, refreshBalance } =
    useWalletRefactored();
  const network = getCurrentNetwork();

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const walletId = storage.getItem("walletId");
      const walletAddr = storage.getItem("walletAddress");

      if (walletId && walletAddr) {
        try {
          wallet.setWallet(walletId);
          const addressResult = await wallet.getAddress();
          const publicKey = addressResult.address;

          if (publicKey) {
            // Update store with connection info
            const network = getCurrentNetwork();
            const networkName = network.networkPassphrase.includes("Test")
              ? "testnet"
              : network.networkPassphrase.includes("Public")
                ? "mainnet"
                : "local";

            useWalletStore
              .getState()
              .connectWalletStore(publicKey, networkName, walletId, publicKey);

            // Fetch balance
            try {
              const balances = await fetchBalance(publicKey);
              const nativeBalance = balances.find(
                (b: any) => b.asset_type === "native"
              );
              const balance = nativeBalance
                ? parseFloat(nativeBalance.balance).toFixed(4)
                : "0";
              useWalletStore.getState().updateBalance(balance);
            } catch (error) {
              console.error("Error fetching balance:", error);
              useWalletStore.getState().updateBalance("0");
            }
          }
        } catch (error) {
          console.log("Wallet not connected");
        }
      }
    } catch (error) {
      console.log("Wallet not connected");
    }
  };

  const handleConnectWallet = async () => {
    try {
      await connectWallet();
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect wallet",
        variant: "destructive",
      });
    }
  };

  const handleDisconnectWallet = async () => {
    try {
      await disconnectWallet();
    } catch (error: any) {
      toast({
        title: "Disconnect failed",
        description: error.message || "Failed to disconnect wallet",
        variant: "destructive",
      });
    }
  };

  return (
    <Web3Context.Provider
      value={{
        wallet: {
          address,
          isConnected,
          balance,
          network: networkName,
        },
        connectWallet: handleConnectWallet,
        disconnectWallet: handleDisconnectWallet,
        refreshBalance,
        getContract: () => contractService,
        network,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3Refactored() {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error(
      "useWeb3Refactored must be used within Web3ProviderRefactored"
    );
  }
  return context;
}
