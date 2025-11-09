/**
 * Refactored wallet hook
 * Following the pattern from Pacto P2P
 */

import { useCallback } from "react";
import { ISupportedWallet } from "@creit.tech/stellar-wallets-kit";
import { kit } from "@/lib/web3/wallet-kit";
import useWalletStore from "@/store/wallet.store";
import { fetchBalance } from "@/util/wallet";
import { getCurrentNetwork } from "@/lib/web3/stellar-config";
import { toast } from "@/hooks/use-toast";

export const useWalletRefactored = () => {
  const {
    connectWalletStore,
    disconnectWalletStore,
    updateConnectionStatus,
    updateBalance,
  } = useWalletStore();

  const connectWallet = useCallback(async () => {
    try {
      await kit.openModal({
        modalTitle: "Connect to your favorite wallet",
        onWalletSelected: async (option: ISupportedWallet) => {
          try {
            kit.setWallet(option.id);

            // Wait for the wallet to be properly set
            await new Promise((resolve) => setTimeout(resolve, 100));

            const { address } = await kit.getAddress();

            if (address) {
              const network = getCurrentNetwork();
              const networkName = network.networkPassphrase.includes("Test")
                ? "testnet"
                : network.networkPassphrase.includes("Public")
                  ? "mainnet"
                  : "local";
              const walletType = option.name || option.id;
              const publicKey = address;

              connectWalletStore(address, networkName, walletType, publicKey);
              updateConnectionStatus(true);

              // Fetch balance
              try {
                const balances = await fetchBalance(address);
                const nativeBalance = balances.find(
                  (b: any) => b.asset_type === "native"
                );
                const balance = nativeBalance
                  ? parseFloat(nativeBalance.balance).toFixed(4)
                  : "0";
                updateBalance(balance);
              } catch (error) {
                console.error("Error fetching balance:", error);
                updateBalance("0");
              }

              // Add a small delay to ensure the store is updated
              await new Promise((resolve) => setTimeout(resolve, 200));

              toast({
                title: "Wallet connected",
                description: `Connected to ${address.slice(0, 6)}...${address.slice(-4)}`,
              });
            } else {
              throw new Error("Failed to get wallet address");
            }
          } catch (error) {
            console.error("Error in wallet selection:", error);
            updateConnectionStatus(false);
            throw error;
          }
        },
      });
    } catch (error) {
      console.error("Error opening wallet modal:", error);
      updateConnectionStatus(false);
      throw error;
    }
  }, [connectWalletStore, updateConnectionStatus, updateBalance]);

  const disconnectWallet = useCallback(async () => {
    try {
      await kit.disconnect();
      disconnectWalletStore();
      updateConnectionStatus(false);
      toast({
        title: "Wallet disconnected",
        description: "Your wallet has been disconnected",
      });
    } catch (error) {
      console.error("Error disconnecting wallet:", error);
      throw error;
    }
  }, [disconnectWalletStore, updateConnectionStatus]);

  const refreshBalance = useCallback(async () => {
    const { address } = useWalletStore.getState();
    if (!address) {
      return;
    }

    try {
      const balances = await fetchBalance(address);
      const nativeBalance = balances.find(
        (b: any) => b.asset_type === "native"
      );
      const balance = nativeBalance
        ? parseFloat(nativeBalance.balance).toFixed(4)
        : "0";
      updateBalance(balance);
    } catch (error) {
      console.error("Error refreshing balance:", error);
    }
  }, [updateBalance]);

  return {
    connectWallet,
    disconnectWallet,
    refreshBalance,
  };
};
