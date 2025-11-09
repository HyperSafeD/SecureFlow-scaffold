/**
 * Admin hooks for contract administration
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { contractService } from "@/lib/web3/contract-service";
import { toast } from "@/hooks/use-toast";
import { useWeb3 } from "@/contexts/web3-context";

/**
 * Hook to pause job creation
 */
export function usePauseJobCreation() {
  const queryClient = useQueryClient();
  const { wallet } = useWeb3();

  return useMutation({
    mutationFn: () => {
      if (!wallet.address) {
        throw new Error("Wallet not connected");
      }
      return contractService.pauseJobCreation(wallet.address);
    },
    onSuccess: (txHash) => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast({
        title: "Job creation paused",
        description: `Transaction confirmed: ${txHash?.slice(0, 8)}...`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to pause job creation",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to unpause job creation
 */
export function useUnpauseJobCreation() {
  const queryClient = useQueryClient();
  const { wallet } = useWeb3();

  return useMutation({
    mutationFn: () => {
      if (!wallet.address) {
        throw new Error("Wallet not connected");
      }
      return contractService.unpauseJobCreation(wallet.address);
    },
    onSuccess: (txHash) => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast({
        title: "Job creation unpaused",
        description: `Transaction confirmed: ${txHash?.slice(0, 8)}...`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unpause job creation",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to set platform fee
 */
export function useSetPlatformFee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (feeBP: number) => contractService.setPlatformFeeBP(feeBP),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast({
        title: "Platform fee updated",
        description: "Platform fee has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set platform fee",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to set fee collector
 */
export function useSetFeeCollector() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (feeCollector: string) =>
      contractService.setFeeCollector(feeCollector),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast({
        title: "Fee collector updated",
        description: "Fee collector has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set fee collector",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to whitelist token
 */
export function useWhitelistToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (token: string) => contractService.whitelistToken(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast({
        title: "Token whitelisted",
        description: "Token has been whitelisted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to whitelist token",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to authorize arbiter
 */
export function useAuthorizeArbiter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (arbiter: string) => contractService.authorizeArbiter(arbiter),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast({
        title: "Arbiter authorized",
        description: "Arbiter has been authorized successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to authorize arbiter",
        variant: "destructive",
      });
    },
  });
}
